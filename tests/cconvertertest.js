var expect    = require("chai").expect;
var assert = require('assert');
var cconverter = require("../CConverter");

//For HTTP request test
var sinon = require('sinon');
var PassThrough = require('stream').PassThrough;
var https = require('https');

describe("Currency Converter", function() {

	describe("Parse JSON response msg", function() {
		it("Check types accordingly", function() {
			var jsonMsg = { "from" : "HKD", "to" : "BND", "successCount" : "0" , "failedCount" : "0"};
			//var jsonString = jsonMsg; //JSON.parse(jsonMsg);

			var fromCurr = cconverter.getJsonData(jsonMsg, "from");
			var toCurr = cconverter.getJsonData(jsonMsg, "to");
			var successCount = cconverter.getJsonData(jsonMsg, "successCount");
			var failedCount = cconverter.getJsonData(jsonMsg, "failedCount");

			expect(fromCurr).to.be.an('string');
			expect(toCurr).to.be.an('string');
			expect(successCount).to.be.an('number');
			expect(failedCount).to.be.an('number');
		});
	});
	
	describe('HTTP Request Tests', function() {
		beforeEach(function() {
			this.request = sinon.stub(https, 'request');
		});
	 
		afterEach(function() {
			https.request.restore();
		});
	
		it('Test successful http request', function(done) {
			var expected = true; //{"success":true,"source":"HKD","target":"SGD","rate":0.2836342,"amount":0.18,"message":""};
			var response = new PassThrough();
			response.write(JSON.stringify(expected));
			response.end();
			
			//To fix -- Still fails. Keeps returning 'undefined' instead of 'true' even though input params are correct
			this.request.callsArgWith(1, response)
						.returns(new PassThrough());
			
			cconverter.getRequest('HKD', 'SGD', function(result) {
				assert.equal(result, expected); //equal or deepequal?
				done();
			});
		});
		
		it('Test failed http request', function(done) {
			var expected = 'false';
			var request = new PassThrough();

			this.request.returns(request);

			cconverter.getRequest('BND', 'USD', function(result) {
				assert.equal(result, expected);
				done();
			});

			request.emit('error', expected);
		});
	});
  
	/*
	describe('with a valid mongo string parameter', function() {
		it('should return a rejected promise', function(done) {
			var con = mongoFactory.getConnection('mongodb://localhost:27017/test');
			expect(con).to.be.fulfilled;
			done();
		});
	});
	*/
  
});