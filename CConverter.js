var https = require('https');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var beanstalkClient = require('beanstalk_client').Client;

var beanstalkServerURL = '127.0.0.1:11300';
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

var mongoServerURL = 'mongodb://localhost:27017/cconverter';

//Parse JSON data
var getJsonData = function(jsonData, type)
{
	switch(type)
	{
		case "from" : return jsonData.from; break;
		case "to" : return jsonData.to; break;
		case "successCount" : return parseInt(jsonData.successCount); break;
		case "failedCount" : return parseInt(jsonData.failedCount); break;
		default: break;
	}
}

//HTTP Get request
var getRequest = function(from, to, callback)
{
	var options = {
				  host: 'currency-api.appspot.com',
				  path: '/api/' + from + '/' + to + '.json'
				};
	
	console.log(options);
				
	var req = https.request(options, function(res) {

		var bodyChunks = [];
		
		res.on('data', function(chunk) {
			bodyChunks.push(chunk);
		});
			
		res.on('end', function() {
			
			var body = Buffer.concat(bodyChunks);
			var obj = JSON.parse(bodyChunks);
			console.log('obj.success : ' + obj.success);
			
			callback(obj);
		})
	});

	req.on('error', function(e) {
		console.log('ERROR: ' + e.message);
		callback(e);
	});
			
	req.end();
}

//Add each function into 'exports'
var exports = module.exports = {
	getJsonData : getJsonData,
	getRequest : getRequest
}

//Get initial 1 job from beanstalkd server
beanstalkClient.connect(beanstalkServerURL, function(err, conn) {

	conn.watch('default', function(err, numwatched) {
	
		function resJob()
		{
			conn.reserve(function(err, job_id, job_json) {
				console.log('got job: ' + job_id);
				console.log('got job data: ' + job_json);
				
				var jsonData = JSON.parse(job_json);
				fromCurr = getJsonData(jsonData, "from");
				toCurr = getJsonData(jsonData, "to");
				successCount = getJsonData(jsonData, "successCount");
				failedCount = getJsonData(jsonData, "failedCount");
				
				getRequest(fromCurr, toCurr, function(obj) {
					
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
						
						//Connect to mongo - Create collection if dont exist, then insert record
						MongoClient.connect(mongoServerURL, function(err, db) {
							assert.equal(null, err);
							console.log("Connected correctly to mongod server.");

							db.createCollection("exchange_rates", function(err, collection){

								//Call insertDocument function
								insertDocument(db, obj, function() {
									db.close();
								});

							});
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
				});
			})
		}
		
		resJob();
	});
});

var insertDocument = function(db, obj, callback) {
	db.collection('exchange_rates').insertOne( {
		"from" : obj.source,
		"to" : obj.target,
		"created_at" : new Date(),
		"rate" : obj.rate.toFixed(2) 
	}, function(err, result) {
		assert.equal(err, null);
		console.log("Inserted document");
		callback(result);
	});
};

