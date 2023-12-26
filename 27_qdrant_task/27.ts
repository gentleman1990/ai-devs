import {TextLoader} from "langchain/document_loaders/fs/text";
import {Document} from "langchain/document";
import {OpenAIEmbeddings} from "langchain/embeddings/openai";
import { v4 as uuidv4 } from 'uuid';
import {QdrantClient} from '@qdrant/js-client-rest';
import { authorize, getInputData, sendAnswer } from "../common/helper";
import { ConversationChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { BufferWindowMemory } from "langchain/memory";


const MEMORY_PATH = "../people.json";
const COLLECTION_NAME = "people_v4";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const chat = new ChatOpenAI();
const memory = new BufferWindowMemory({ k: 1 });
const chain = new ConversationChain({ llm: chat, memory: memory });
const embeddings = new OpenAIEmbeddings({ maxConcurrency: 5 });

const result = await qdrant.getCollections();
const indexed = result.collections.find((collection) => collection.name === COLLECTION_NAME);
console.log(result);
// Create collection if not exists
if (!indexed) {
    await qdrant.createCollection(COLLECTION_NAME, { vectors: { size: 1536, distance: 'Cosine', on_disk: true }});
}

const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
// Index documents if not indexed
if (!collectionInfo.points_count) {

    // Read File
    const loader = new TextLoader(MEMORY_PATH);
    let [memory] = await loader.load();
    const jsonData = JSON.parse(memory.pageContent);
    let documents = jsonData.map((element: any) => (new Document({ 
        pageContent: JSON.stringify(element), 
        metadata: {
            "source": COLLECTION_NAME,
            "imie": element.imie,
            "nazwisko": element.nazwisko,
            "wiek": element.wiek,
            "ulubiona_postac_z_kapitana_bomby": element.ulubiona_postac_z_kapitana_bomby,
            "ulubiony_serial": element.ulubiony_serial,
            "ulubiony_film": element.ulubiony_film,
            "ulubiony_kolor": element.ulubiony_kolor,
            "uuid": uuidv4()
        } })));

//     let documents = memory.pageContent.split("},").map((content) => (new Document({ pageContent: content })));
    
//     // Add metadata
//     documents = documents.map( (document) => {
//         document.metadata.source = COLLECTION_NAME;
//         document.metadata.content = document.pageContent;
//         document.metadata.uuid = uuidv4();
//         return document;
//     });

    // Generate embeddings
    const points = [];
    for (const document of documents) {
        console.log(`Embedding generation for document: ${document.metadata.uuid}`)
        const [embedding] = await embeddings.embedDocuments([document.pageContent]);
        points.push({
            id: document.metadata.uuid,
            payload: document.metadata,
            vector: embedding,
        });
    }

    // Index
    await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        batch: {
            ids: points.map((point) => (point.id)),
            vectors: points.map((point) => (point.vector)),
            payloads: points.map((point) => (point.payload)),
        },
    })
}

const taskName = "people"
const token = await authorize(taskName);
const inputData = await getInputData(token, taskName);
console.log(inputData.question)


const {response: simplification} = await chain.call({ input: `Find the first and last name. Answer ultrabriefly and skip any explanation. ||| TEXT ${inputData.question} ||| EXAMPLES 1. Co podoba się Tomaszowi Wicherkowi? - Tomasz Wicherek 2. Jaki jest ulubiony kolor Sary Ochary? - Sara Ochara` });
console.log(`${simplification}`)

const queryEmbedding = await embeddings.embedQuery(simplification);

const search = await qdrant.search(COLLECTION_NAME, {
    vector: queryEmbedding,
    limit: 1,
    filter: {
        must: [
            {
                key: 'source',
                match: {
                    value: COLLECTION_NAME
                }
            }
        ]
    }
});

const searchResult = await search[0].payload
console.log(search);
const systemMessage = `Answer questions as truthfully as possible using the context below and nothing else. ||| QUESTION ${inputData.question} ||| CONTEXT ${JSON.stringify(searchResult)}`;
console.log(systemMessage);
const {response: response1} = await chain.call({ input: systemMessage });

console.log(`Answer from chatGPT: ${response1}`);
sendAnswer(token, response1);