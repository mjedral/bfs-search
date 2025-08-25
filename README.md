# BFS Search - Finding Monika

## Description

Code implements breadth-first search (BFS) algorithm to find Monika Kowalczyk's location based on connections between people and places.

### Search process:

1. **Data loading** - code reads context from `data.txt` file
2. **Initialization** - starts search from Gdansk and Poznan
3. **BFS traversal**:
   - For each city finds people in that city
   - For each person finds places associated with them
   - Tests each new place as potential Monika's location
4. **Result verification** - code checks if found location is OLSZTYN (correct answer)

### Data structure:

```typescript
SIMULATED_DATA = {
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
}
```

### Helper functions:

- `getData()` - simulates API responses based on local data
- `askModel()` - uses OpenAI to analyze context and suggest next steps
- `testLocation()` - checks if given location is OLSZTYN
- `getText()` - loads case context from data.txt file

## Running the code

### Requirements:
- Node.js
- TypeScript
- OpenAI API key in environment variable `OPENAI_API_KEY`

### Installation and execution:

```bash
# Install dependencies
npm install

# Run the code
npx ts-node bfs-search.ts
```

### File structure:
```
bfs-search/
├── bfs-search.ts    # main code
├── data.txt         # Monika's case context
├── package.json     # dependencies
└── README.md        # this file
```

## Expected result

Code should find OLSZTYN location and display success message:

```
SUCCESS! Correct location found: OLSZTYN
SUKCES! Znaleziono poprawną lokalizację!
```

## BFS Algorithm

1. Queue starts with cities: Gdansk, Poznan
2. For each city in queue:
   - Gets list of people in that city
   - Adds people to queue if not yet visited
3. For each person in queue:
   - Gets list of places associated with that person
   - Tests each place as potential Monika's location
   - Adds new cities to queue
4. Ends when finds OLSZTYN or searches all possibilities 