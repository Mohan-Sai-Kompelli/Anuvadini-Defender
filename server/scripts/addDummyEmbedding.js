require('dotenv').config({ path: __dirname + '/../.env' });
const { MongoClient } = require('mongodb');

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    const db = client.db();
    // Note: The collection name in check.py is spelled "embedings"
    const collection = db.collection('embedings'); 
    
    // Create a 512-dimensional dummy array (which check.py expects)
    const dummyEmbedding = new Array(512).fill(0.01);
    
    await collection.updateOne(
      { _id: '7206823720' },
      { $set: { 
          name: 'Test User', 
          email: 'test@example.com', 
          embedding: dummyEmbedding 
        } 
      },
      { upsert: true }
    );
    
    console.log('Successfully added dummy embedding for UID: 7206823720 to the "embedings" collection.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
