import axios from 'axios';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const CITIES = {
    GDANSK: 'Gdansk',
    POZNAN: 'Poznan',
    SZCZECIN: 'Szczecin',
    WARSZAWA: 'Warszawa',
    WROCLAW: 'Wroclaw',
    OLSZTYN: 'Olsztyn'
} as const;

const INITIAL_CITIES = new Set<string>([CITIES.GDANSK, CITIES.POZNAN]);


interface SimulatedData {
    people: Record<string, string[]>;
    places: Record<string, string[]>;
}

const SIMULATED_DATA: SimulatedData = {
    people: {
        'MONIKA': ['GDANSK'],
        'PAWEL': ['GDANSK', 'POZNAN'],
        'MARCIN': ['POZNAN'],
        'TOMASZ': ['SZCZECIN', 'POZNAN', 'WROCLAW'],
        'ECHO': ['GDANSK', 'POZNAN', 'WARSZAWA', 'WROCLAW', 'OLSZTYN'],
        'GHOST': ['SZCZECIN', 'WROCLAW', 'OLSZTYN']
    },
    places: {
        'GDANSK': ['MONIKA', 'PAWEL', 'ECHO'],
        'POZNAN': ['PAWEL', 'MARCIN', 'TOMASZ', 'ECHO'],
        'SZCZECIN': ['TOMASZ', 'GHOST'],
        'WARSZAWA': ['ECHO'],
        'WROCLAW': ['TOMASZ', 'ECHO', 'GHOST'],
        'OLSZTYN': ['ECHO', 'GHOST']
    }
};


const CORRECT_ANSWER = 'OLSZTYN' as const;

interface KnowledgeBase {
    readonly peopleLocations: Map<string, string[]>;
    readonly cityPeople: Map<string, string[]>;
    readonly visitedCities: Set<string>;
    readonly visitedPeople: Set<string>;
    readonly testedLocations: Set<string>;
    readonly failedQueries: Set<string>;
    context: string;
}

const knowledgeBase: KnowledgeBase = {
    peopleLocations: new Map(),
    cityPeople: new Map(),
    visitedCities: new Set(),
    visitedPeople: new Set(),
    testedLocations: new Set(),
    failedQueries: new Set(),
    context: '',
};

type NodeType = 'city' | 'person';
type EndpointType = 'people' | 'places';

interface QueueNode {
    type: NodeType;
    value: string;
}

async function getData(endpoint: EndpointType, query: string): Promise<string[] | null> {
    if (knowledgeBase.failedQueries.has(query)) {
        return null;
    }

    try {
        console.log(`Querying ${endpoint} for: "${query}"`);


        let result: string[] | null = null;

        const normalizedQuery = query.toUpperCase();

        if (endpoint === 'people') {
            result = SIMULATED_DATA.people[normalizedQuery] ?? null;
        } else if (endpoint === 'places') {
            result = SIMULATED_DATA.places[normalizedQuery] ?? null;
        }

        if (result && result.length > 0) {
            console.log(`Response from ${endpoint}:`, { code: 0, message: result.join(' ') });
            console.log(`Found names:`, result);
            return result;
        }

        console.log(`No data found for ${query}`);
        knowledgeBase.failedQueries.add(query);
        return null;

    } catch (error) {
        console.error(`Error fetching data from ${endpoint}:`, error);
        knowledgeBase.failedQueries.add(query);
        return null;
    }
}

async function askModel(prompt: string): Promise<string> {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Jesteś inteligentnym agentem śledczym. Twoim zadaniem jest znalezienie Moniki Kowalczyk.

                    KONTEKST: ${knowledgeBase.context}

                    ZASADY:
                    1. Analizuj dostępne informacje o lokalizacjach osób
                    2. Szukaj połączeń między osobami i miejscami
                    3. Skup się na znalezieniu najbardziej obiecującego następnego celu
                    4. Zwracaj TYLKO nazwę najważniejszej osoby lub miejsca do zbadania
                    5. Uwzględnij kontekst Moniki, Pawła, Tomasza i innych osób
                    6. Twoja odpowiedź powinna być JEDNYM SŁOWEM - albo imię osoby (np. JULIUSZ, TOMASZ) albo nazwa miejsca (np. GDYNIA, KONIN)
                    7. Wybierz cel, który najprawdopodobniej doprowadzi do znalezienia Moniki`
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 50
        });

        const result = response.choices[0]?.message?.content?.trim();
        if (!result) {
            console.warn('Empty response from AI model');
            return 'ECHO';
        }

        return result;
    } catch (error) {
        console.error('Error calling AI model:', error);
        return 'ECHO';
    }
}

async function getText(): Promise<string> {
    try {
        console.log('Loading case context from data.txt...');
        const dataPath = path.join(__dirname, 'data.txt');

        if (!fs.existsSync(dataPath)) {
            throw new Error(`File not found: ${dataPath}`);
        }

        const content = fs.readFileSync(dataPath, 'utf-8');

        if (!content.trim()) {
            throw new Error('Data file is empty');
        }

        console.log('Context loaded successfully');
        knowledgeBase.context = content;
        return content;
    } catch (error) {
        console.error('Error loading data.txt:', error);
        throw new Error(`Failed to load case context: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function testLocation(location: string): Promise<boolean> {
    const normalizedLocation = location.toUpperCase();

    if (knowledgeBase.testedLocations.has(normalizedLocation)) {
        console.log(`Location ${location} already tested, skipping`);
        return false;
    }

    knowledgeBase.testedLocations.add(normalizedLocation);
    console.log(`Testing location: ${location}`);

    if (normalizedLocation === CORRECT_ANSWER) {
        console.log('SUCCESS!! Correct location found:', location);
        return true;
    }

    console.log(`Location ${location} is not correct`);
    return false;
}

function getDiscoveredData(): { people: string[], places: string[] } {
    const discoveredPeople = Array.from(knowledgeBase.visitedPeople);
    const discoveredPlaces = Array.from(knowledgeBase.visitedCities);
    return { people: discoveredPeople, places: discoveredPlaces };
}

async function agentLoop(): Promise<string> {
    await getText();

    const aiSuggestion = await askModel(`
        Na podstawie kontekstu sprawy o Monice Kowalczyk, które miasto powinniśmy zbadać jako pierwsze?
        Dostępne miasta startowe: Gdansk, Poznan
        Przeczytaj opis sprawy i wybierz które miasto może być ważniejsze.
    `);

    console.log(`\n=== AI INITIAL SUGGESTION: ${aiSuggestion} ===\n`);

    const queue: QueueNode[] = [];
    let queueIndex = 0;

    const aiCity = aiSuggestion.toUpperCase();
    if (INITIAL_CITIES.has(aiCity)) {
        queue.push({ type: "city", value: aiCity });
        knowledgeBase.visitedCities.add(aiCity);
        for (const city of INITIAL_CITIES) {
            if (city !== aiCity) {
                queue.push({ type: "city", value: city });
                knowledgeBase.visitedCities.add(city);
            }
        }
    } else {
        for (const city of INITIAL_CITIES) {
            queue.push({ type: "city", value: city });
            knowledgeBase.visitedCities.add(city);
        }
    }

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];

        if (current.type === "city") {
            const people = await getData("places", current.value);
            if (people?.length) {
                knowledgeBase.cityPeople.set(current.value, people);

                const discovered = getDiscoveredData();
                const nextTarget = await askModel(`
                W mieście ${current.value} znaleźliśmy osoby: ${people.join(', ')}.
                Odkryte osoby: ${discovered.people.join(', ') || 'brak'}
                Którą osobę powinniśmy zbadać następnie?
                `);

                console.log(`\n=== AI suggests investigating: ${nextTarget} ===\n`);

                const prioritizedPeople = people.slice();
                const aiPerson = nextTarget.toUpperCase();
                if (people.includes(aiPerson)) {
                    prioritizedPeople.unshift(aiPerson);
                    prioritizedPeople.splice(prioritizedPeople.lastIndexOf(aiPerson), 1);
                }

                for (const person of prioritizedPeople) {
                    if (!knowledgeBase.visitedPeople.has(person)) {
                        queue.push({ type: "person", value: person });
                        knowledgeBase.visitedPeople.add(person);
                    }
                }
            }
        } else if (current.type === "person") {
            const places = await getData("people", current.value);
            if (places?.length) {
                knowledgeBase.peopleLocations.set(current.value, places);

                const discovered = getDiscoveredData();
                const nextLocation = await askModel(`
                Osoba ${current.value} jest powiązana z miejscami: ${places.join(', ')}.
                Odkryte miejsca: ${discovered.places.join(', ') || 'tylko miasta startowe'}
                Które miejsce jest najbardziej obiecujące?
                `);

                console.log(`\n=== AI suggests location: ${nextLocation} ===\n`);

                const aiLocation = nextLocation.toUpperCase();
                if (places.includes(aiLocation) && shouldTestLocation(aiLocation)) {
                    console.log(`Testing AI suggested place ${aiLocation} (from person ${current.value})`);
                    const success = await testLocation(aiLocation);
                    if (success) return aiLocation;

                    if (!knowledgeBase.visitedCities.has(aiLocation)) {
                        queue.push({ type: "city", value: aiLocation });
                        knowledgeBase.visitedCities.add(aiLocation);
                    }
                }

                for (const place of places) {
                    if (place !== aiLocation && shouldTestLocation(place)) {
                        console.log(`Testing place ${place} (from person ${current.value})`);
                        const success = await testLocation(place);
                        if (success) return place;

                        if (!knowledgeBase.visitedCities.has(place)) {
                            queue.push({ type: "city", value: place });
                            knowledgeBase.visitedCities.add(place);
                        }
                    }
                }
            }
        }
    }

    return "No data found";
}

function shouldTestLocation(place: string): boolean {
    const normalizedPlace = place.toUpperCase();
    return !knowledgeBase.testedLocations.has(normalizedPlace) && !INITIAL_CITIES.has(place);
}

async function main(): Promise<void> {
    try {
        console.log('=== STARTING MONIKA SEARCH ===\n');
        const location = await agentLoop();
        console.log('\n=== FINAL RESULT ===');
        console.log('Final location:', location);

        if (location === CORRECT_ANSWER) {
            console.log('SUCCESS! Found correct location!');
        } else {
            console.log('Failed to find correct location.');
        }
    } catch (error) {
        console.error('Error occurred:', error);
    }
}

export { getData, askModel, getText, testLocation, agentLoop, knowledgeBase };

if (require.main === module) {
    main();
}
