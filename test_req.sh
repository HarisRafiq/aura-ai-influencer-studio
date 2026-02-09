curl -X POST "http://localhost:8000/ai/scout-places" \
     -H "Content-Type: application/json" \
     -d '{
           "entity": {
             "kind": "influencer",
             "data": {
               "name": "Test Influencer",
               "location": "New York, USA",
               "traits": ["Fashion", "Travel"],
               "niche": "Lifestyle"
             }
           }
         }'
