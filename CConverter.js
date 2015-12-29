var http = require('https');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

var options = {
  host: 'currency-api.appspot.com',
  path: '/api/usd/hkd.json'
};

var mongoServerURL = 'mongodb://localhost:27017/test';

var req = http.get(options, function(res) {

  var bodyChunks = [];
  res.on('data', function(chunk) {
	
    bodyChunks.push(chunk);
	}).on('end', function() {
	
		var body = Buffer.concat(bodyChunks);
		
		var obj = JSON.parse(bodyChunks);
		console.log( obj.rate );
		
		//Connect to mongo - Create collection if dont exist, then insert record
		MongoClient.connect(mongoServerURL, function(err, db) {
			assert.equal(null, err);
			console.log("Connected correctly to server.");
			
			db.createCollection("exchange_rates", function(err, collection){
			
				//Call insertDocument function
				insertDocument(db, obj, function() {
					db.close();
				});
				
			});
		});
	
	// Use console to view beanstalkd server

    //1. Save to MongoDB
	//2. Record if success/fail - Connection to API / MongoDB 
	//3. If fail, put to tube n delay 3 sec. Increment count
	//4. If success, put to tube n delay 60 sec. Increment count
	//5. If success count = 10, stop || If fail count = 3, bury
	//6. 
  })
});

var insertDocument = function(db, obj, callback) {
	db.collection('exchange_rates').insertOne( {
		"from" : obj.source,
		"to" : obj.target,
		"created_at" : new Date(),
		"rate" : obj.rate
	}, function(err, result) {
		assert.equal(err, null);
		console.log("Inserted document");
		callback(result);
	});
};

req.on('error', function(e) {
  console.log('ERROR: ' + e.message);
});