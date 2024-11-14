const { connectDB } = require('../modules/connection');

async function migrateToNewSchema() {
    try {
        const { mUserDB } = await connectDB();
        
        // Get all existing user documents
        const oldDocs = await mUserDB.find({}).toArray();
        
        // Group documents by userID
        const userGroups = {};
        oldDocs.forEach(doc => {
            if (!userGroups[doc.userID]) {
                userGroups[doc.userID] = [];
            }
            userGroups[doc.userID].push(doc);
        });
        
        // Create new documents with the updated schema
        for (const [userID, docs] of Object.entries(userGroups)) {
            const servers = {};
            
            // Convert each old document into server data
            docs.forEach(doc => {
                servers[doc.serverID] = {
                    counts: doc.counts,
                    claims: doc.claims,
                    manualClaims: doc.manualClaims
                };
            });
            
            // Create new document with the updated schema
            await mUserDB.insertOne({
                userID,
                servers
            });
        }
        
        // Create backup collection of old data
        await mUserDB.aggregate([
            { $out: "mUserDB_backup" }
        ]).toArray();
        
        // Remove old documents
        await mUserDB.deleteMany({
            servers: { $exists: false }
        });
        
        console.log('Migration completed successfully');
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

// Only run this file directly to perform migration
if (require.main === module) {
    migrateToNewSchema()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { migrateToNewSchema };
