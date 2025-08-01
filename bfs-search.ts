import axios from "axios";
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'https://api.example.com';
const API_KEY = process.env.API_KEY;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const NOTES_URL = process.env.NOTES_URL || 'https://api.example.com/notes/target.txt';
const INITIAL_NODES = new Set(['NodeA', 'NodeB']);
const ERROR_KEYWORDS = new Set(['restricted', 'no data', 'anomaly', 'error', 'forbidden']);

interface KnowledgeBase {
    entityLocations: Map<string, string[]>;
    locationEntities: Map<string, string[]>;
    visitedLocations: Set<string>;
    visitedEntities: Set<string>;
    testedTargets: Set<string>;
    failedQueries: Set<string>;
}

const knowledgeBase: KnowledgeBase = {
    entityLocations: new Map(),
    locationEntities: new Map(),
    visitedLocations: new Set(),
    visitedEntities: new Set(),
    testedTargets: new Set(),
    failedQueries: new Set(),
};

type NodeType = "location" | "entity";
type EndpointType = "entities" | "locations";

interface QueueNode {
    type: NodeType;
    value: string;
}

interface ApiResponse {
    code?: number;
    message?: string;
}

async function getData(endpoint: EndpointType, query: string): Promise<string[] | null> {
    if (knowledgeBase.failedQueries.has(query)) {
        return null;
    }

    try {
        console.log(`Querying ${endpoint} for: "${query}"`);

        const response = await axios.post(`${API_BASE_URL}/${endpoint}`, {
            apikey: API_KEY,
            query: query
        }, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

        console.log(`Response from ${endpoint}:`, response.data);

        if (response.data?.message && isErrorResponse(response.data.message)) {
            console.log(`Error/restriction received for ${query}`);
            knowledgeBase.failedQueries.add(query);
            return null;
        }

        if (response.data?.message) {
            const names = response.data.message.trim().split(/\s+/).filter((name: string) => name.length > 0);
            console.log(`Found names:`, names);
            return names.length > 0 ? names : null;
        }

        return null;

    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        knowledgeBase.failedQueries.add(query);
        return null;
    }
}

function isErrorResponse(message: string): boolean {
    return Array.from(ERROR_KEYWORDS).some(keyword => message.includes(keyword));
}

async function askAI(prompt: string): Promise<string> {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: `You are an intelligent search agent. Your task is to find a specific target through network exploration.

            RULES:
            1. If you encounter "restricted data", "no data", "anomaly" - change strategy
            2. Try different paths - if one doesn't work, go back and try another
            3. Be systematic but flexible
            4. If you can't get data about an entity/location, try different approach
            5. Return only JSON format: {"action": "entities/locations/test", "query": "name", "reason": "explanation"}
            6. If you want to test a location, use action: "test"`
            },
            { role: "user", content: prompt }
        ],
        temperature: 0.1
    });

    return response.choices[0].message.content?.trim() || '';
}

async function getTargetNotes(): Promise<string> {
    try {
        console.log('Fetching target notes...');
        const response = await axios.get(NOTES_URL, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
        console.log('Notes fetched successfully');
        return response.data;
    } catch (error) {
        console.error('Error fetching notes:', error);
        throw error;
    }
}

async function testTarget(target: string): Promise<boolean> {
    if (knowledgeBase.testedTargets.has(target)) {
        console.log(`Target ${target} already tested, skipping`);
        return false;
    }

    knowledgeBase.testedTargets.add(target);

    const payload = {
        task: "search",
        apikey: API_KEY,
        answer: target
    };

    console.log(`Testing target: ${target}`);

    try {
        const result = await axios.post(`${API_BASE_URL}/validate`, payload, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

        console.log('API response:', result.data);

        if (result.data?.code === 0 && result.data?.message?.includes('SUCCESS:')) {
            console.log('TARGET FOUND! Success response:', result.data.message);
            return true;
        }

        return false;

    } catch (error) {
        console.error('Error testing target:', error);
        return false;
    }
}

async function searchAgent(): Promise<string> {
    const queue: QueueNode[] = [];
    let queueIndex = 0;

    for (const location of INITIAL_NODES) {
        queue.push({ type: "location", value: location });
        knowledgeBase.visitedLocations.add(location);
    }

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];

        if (current.type === "location") {
            const entities = await getData("locations", current.value);
            if (entities?.length) {
                knowledgeBase.locationEntities.set(current.value, entities);
                for (const entity of entities) {
                    if (!knowledgeBase.visitedEntities.has(entity)) {
                        queue.push({ type: "entity", value: entity });
                        knowledgeBase.visitedEntities.add(entity);
                    }
                }
            }
        } else if (current.type === "entity") {
            const locations = await getData("entities", current.value);
            if (locations?.length) {
                knowledgeBase.entityLocations.set(current.value, locations);
                for (const location of locations) {
                    if (shouldTestTarget(location)) {
                        console.log(`Testing location ${location} (from entity ${current.value})`);
                        const success = await testTarget(location);
                        if (success) return location;

                        if (!knowledgeBase.visitedLocations.has(location)) {
                            queue.push({ type: "location", value: location });
                            knowledgeBase.visitedLocations.add(location);
                        }
                    }
                }
            }
        }
    }

    return "No target found";
}

function shouldTestTarget(target: string): boolean {
    return !knowledgeBase.testedTargets.has(target) && !INITIAL_NODES.has(target);
}

async function main(): Promise<void> {
    try {
        const result = await searchAgent();
        console.log('Final result:', result);
    } catch (error) {
        console.error('Error occurred:', error);
    }
}

export { getData, askAI, getTargetNotes, testTarget, searchAgent, knowledgeBase };

if (require.main === module) {
    main();
} 