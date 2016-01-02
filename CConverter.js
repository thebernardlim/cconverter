var http = require('https');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var beanstalkClient = require('beanstalk_client').Client;

var fromCurr;
var toCurr;
var apiSuccess;
var successCount; // = 0;
var failedCount; // = 0;

//To change to limit as stated
var successDelayTime = 5;
var failDelayTime = 3;

var successMaxTries = 10;
var failMaxTries = 3;

var mongoServerURL = 'mongodb://localhost:27017/test';

//Get initial 1 job from beanstalkd server
beanstalkClient.connect('127.0.0.1:11300', function(err, conn) {

	conn.watch('default', function(err, numwatched) {

		//console.log('numwatched ' + numwatched);

		function resJob()
		{
			conn.reserve(function(err, job_id, job_json) {
				console.log('got job: ' + job_id);
				console.log('got job data: ' + job_json);
				
				var jsonData = JSON.parse(job_json);
				fromCurr = jsonData.from;
				toCurr = jsonData.to;
				successCount = parseInt(jsonData.successCount);
				failedCount= parseInt(jsonData.failedCount);
				
				var options = {
				  host: 'currency-api.appspot.com',
				  path: '/api/' + fromCurr + '/' + toCurr + '.json'
				};

				var mongoServerURL = 'mongodb://localhost:27017/test';

				var req = http.get(options, function(res) {

					var bodyChunks = [];
					res.on('data', function(chunk) {
					
						bodyChunks.push(chunk);
						}).on('end', function() {
						
							var body = Buffer.concat(bodyChunks);
							var obj = JSON.parse(bodyChunks);
							
							apiSuccess = obj.success;
							console.log('apiSuccess: ' + apiSuccess);
							
							//Detect if success or fail. If success response, add 1 count and reput job. If fail, add 1
							
							//***** To refactor?
							if (obj.success)
							{
								successCount++;
								
								conn.destroy(job_id, function(err) {
									console.log('****** Success count: ' + successCount);
									
									//If success count = successMaxTries, stop adding & finish processing final job
									if (successCount == successMaxTries)
									{
										resJob();
									}
									else
									{
										var job_data = {"from": fromCurr, "to" : toCurr, "successCount" : successCount, "failedCount" : failedCount};
										
										conn.put(0, successDelayTime, 1, JSON.stringify(job_data), function(err, job_id) {
											console.log("new job added");
											resJob();
										});
									}
								});	

							}
							else
							{
								failedCount++;
								console.log('****** Fail count: ' + failedCount);
								
								//If failedCount reaches max tries, bury job. Else destroy current job, and re-put job into queue
								if (failedCount == failMaxTries)
								{
									conn.bury(job_id, 0, function(err) {});
									console.log(job_id + ' buried');
								}
								else
								{
									conn.destroy(job_id, function(err) {
										var job_data = {"from": fromCurr, "to" : toCurr, "successCount" : successCount, "failedCount" : failedCount};
										
										conn.put(0, successDelayTime, 1, JSON.stringify(job_data), function(err, job_id) {
											console.log("new job added");
											resJob();
										});
									});	
								}
							}
							
							console.log( 'Rate is ' + obj.rate );
							
							//Connect to mongo - Create collection if dont exist, then insert record
							MongoClient.connect(mongoServerURL, function(err, db) {
								assert.equal(null, err);
								console.log("Connected correctly to mongod server.");

								db.createCollection("exchange_rates", function(err, collection){
								
									//Only insert into db if a rate is successfully obtained
									if (obj.success)
									{
										//Call insertDocument function
										insertDocument(db, obj, function() {
											db.close();
										});
									}

								});
							});
						
						
						// Use console to view beanstalkd server

						//1. Save to MongoDB
						//2. Record if success/fail - Connection to API / MongoDB 
						//3. If fail, put to tube n delay 3 sec. Increment count
						//4. If success, put to tube n delay 60 sec. Increment count
						//5. If success count = 10, stop || If fail count = 3, bury
						})
					});
					

				req.on('error', function(e) {
				  console.log('ERROR: ' + e.message);
				});
			});
		}
		
		resJob();
	});
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

