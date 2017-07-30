var express = require('express');
var bodyParser = require('body-parser');
var os = require('os');
var request = require('request');
var mongoose = require('mongoose');
var fs = require('fs');
var http = require('http');
var https = require('https');
var basicAuth = require('basic-auth-connect');
var compression = require('compression');

var user = '';  
var password '';
var interfaceAppRedir = 'https://s3rv3r.lascuolaopensource.xyz:8443';
var DBUrl = 'mongodb://localhost/controlloAccessi'; 

mongoose.Promise = require('bluebird');

var privateKey  = fs.readFileSync('ssl/server.key', 'utf8');
var certificate = fs.readFileSync('ssl/server.crt', 'utf8');
var ca = fs.readFileSync('ssl/ca.crt');

var credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

mongoose.connect(DBUrl);

var User = mongoose.model('User', {
	name: String,
	surname: String,
	cardId: String,
	pinCode: String
});

var Event = mongoose.model('Event', {
	user: String,
	date: Date,
	type: String
});

var Setting = mongoose.model('Setting', {
	key: String,
	value: String
});

var GuestsModeSetting = mongoose.model('GuestsModeSetting', {
	key: String,
	enabled: Boolean,
	pinCode: String
});

var getDeviceIp = function(cb, cb_err) {
	Setting.findOne({key: "device_ip_address"}, function (err, doc){
		if(doc){
		    cb(doc.value);
		} else {
			cb_err(err);
		}
	});
};

var getGuestsMode = function(cb, cb_err) {
	GuestsModeSetting.findOne({key: "guests_mode"}, function (err, doc){
		if(doc) {
			cb(doc);
		} else {
			cb_err(err);
		}
	});
};

var managementApp = express();
var interfaceApp = express();

managementApp.use(bodyParser.json());       // to support JSON-encoded bodies
managementApp.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));
managementApp.use(compression());

interfaceApp.use(bodyParser.json());       // to support JSON-encoded bodies
interfaceApp.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

managementApp.use(basicAuth(user, password));

managementApp.use('/', express.static(__dirname + '/html'));

interfaceApp.get('/',function(req,res){  
    res.redirect(interfaceAppRedir + req.url)
})

interfaceApp.get('/connect', function (req, res) {

    deviceAddress = req.connection.remoteAddress;
    deviceAddress = deviceAddress.replace(/^.*:/, '');

	Setting.findOne({key: "device_ip_address"}, function (err, doc)
	{
		if(doc){
			Setting.update({key: "device_ip_address"}, {$set: { value: deviceAddress }}, function (err, property)
			{
				if (err) {
					res.send('ERROR|NULL|NULL');
					console.log("Error saving device ip into the database: "+ deviceAddress);
				} 
				else {
					getGuestsMode(function(d){
					    res.send('OKAY|' + (d.enabled?"ENABLED":"DISABLED") + "|" + d.pinCode);
					}, function(err){
							res.send("ERROR|NULL|NULL");
						});
						console.log("Device connected using ip "+ deviceAddress);
					}
				});
	    } else {
		    var new_setting = new Setting({
				key: "device_ip_address",
				value: deviceAddress
			});
			new_setting.save(function (err, setting) {
				if (err) {
				  	res.send('ERROR|NULL|NULL');
					console.log("Error saving device ip into the database for the first time: "+ deviceAddress);
				} else {
					getGuestsMode(function(d){
						res.send('OKAY|' + (d.enabled?"ENABLED":"DISABLED") + "|" + d.pinCode);
					}, function(err) {
						res.send("ERROR|NULL|NULL");
					});
				    console.log("Device connected for the first time using ip "+ deviceAddress);
				}
			});
		}
	});
});

managementApp.get('/reboot', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
		request('http://' + deviceAddress + '/reboot', function (error, response, body) {
			if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/getDeviceAddress', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    res.send({"status": "success", "device_ip": deviceAddress});
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/accessControl/getGuestsSettings', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getGuestsMode(function(d){
	    res.send({"status": "success", "guestsMode": {"enabled": d.enabled, "pinCode": d.pinCode}});
	}, function(err) {
		res.send({"status": "GET_GUESTS_MODE_ERROR", "details": err});
	});
});

managementApp.get('/accessControl/setGuestsSettings', function (req, res) {
	var enabled = (req.query.enabled == "true");
	var pinCode = req.query.pinCode;
    res.setHeader("Content-type", "application/json");
 
   	GuestsModeSetting.findOne({key: "guests_mode"}, function (err, doc){
		if(doc) {
			GuestsModeSetting.update({key: "guests_mode"}, {$set: { enabled: enabled, pinCode: pinCode }}, function (err, property) {
				if (err)res.send({"result": "error", "details": err});
				else res.send({"status": "success"});
			});
		} else {
			var new_guests_mode_setting = new GuestsModeSetting({
				key: "guests_mode",
				enabled: enabled,
				pinCode: pinCode
			});
			new_guests_mode_setting.save(function (err, setting) {
				if (err) {
					res.send({"result": "error", "details": err});
				} else res.send({"status": "success"});				
			});
		}
	});
});

managementApp.get('/setTouchThreshold', function (req, res) {
    var threshold = req.query.threshold;
    res.setHeader("Content-type", "application/json");
        getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/setTouchThreshold?threshold=' + threshold, function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/setTouchSamples', function (req, res) {
    var samples = req.query.samples;
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/setTouchSamples?samples=' + samples, function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	        
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/setTouchDebounce', function (req, res) {
    var debounce = req.query.debounce;
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/setTouchDebounce?debounce=' + debounce, function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	        
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/getTouchThreshold', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/getTouchThreshold', function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/getTouchSamples', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/getTouchSamples', function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/getTouchDebounce', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/getTouchDebounce', function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/getTouchSensorsReadings', function (req, res) {
    res.setHeader("Content-type", "application/json");
    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/getTouchSensorsReadings', function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else res.send(body);
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

managementApp.get('/accessControl/addUser', function (req, res) {
    var cardCode = req.query.cardCode;
    var pinCode = req.query.pinCode;
    var name = req.query.name;
    var surname = req.query.surname;
    if(name.length > 2 && pinCode.length == 4 && cardCode.length > 4){
		User.findOne({ cardId: cardCode}, function (err, doc){
		    if(doc)	res.send({"result": "USER_EXISTS"});
		    else {
				var new_user = new User({
					name: name,
					surname: (surname.length > 1)?surname:"NULL",
					cardId: cardCode,
					pinCode: pinCode
				});

				new_user.save(function (err, usr) {
					if (err) {
						res.send({
							"result": "ADD_USER_ERROR",
			    			"details": err
			    		});
					} else {
					    res.send({
			    			"result": "SUCCESS",
			    			"user": usr
						});
					}
				});
		    }
		});	
    } else res.send({"result": "ERROR_INCORRECT_PARAMETERS"});
});

managementApp.get('/accessControl/updateUser', function (req, res) {
	var id = req.query.id;
    var cardCode = req.query.cardCode;
    var pinCode = req.query.pinCode;
    var name = req.query.name;
    var surname = req.query.surname;
    
	if(name.length > 2 && pinCode.length == 4 && cardCode.length > 4){
		User.findOne({ _id: id}, function (err, doc){
		    if(!doc)res.send({"result": "USER_DOES_NOT_EXIST"});
		    else {
		    	User.update({_id: id}, {$set: { name: name, surname: surname, cardId: cardCode, pinCode: pinCode }}, function (err) {
					if (err) {
					 	res.send({
			    			"result": "UPDATE_USER_ERROR",
			    			"details": err
			    		});
					} else res.send({"result": "SUCCESS"});
				});
		    }
		});	
    } else res.send({"result": "ERROR_INCORRECT_PARAMETERS"});
});

managementApp.get('/accessControl/deleteUser', function (req, res){
    var userId = req.query.userId;
    if(userId && userId.length > 2){
		User.remove({ _id: userId}, function (err){
		    if(err){
		    	res.send({
					"result": "DELETE_USER_ERROR",
					"details": err
				});
		    } else res.send({"result": "SUCCESS"});
		});	
    } 
	else res.send({"result": "ERROR_INCORRECT_PARAMETERS"});
    
});

managementApp.get('/accessControl/listUsers', function (req, res) {
    var orderString = req.query.orderBy;
    var orderField = orderString.replace(/\-/g, "");
    var orderSign = (orderString.indexOf("-") > -1)?(-1):(1);
	var orderParams = {_id: -1};
	
	switch(orderField) {
	    case "name":
	        orderParams = {name: orderSign};
	        break;
	    case "surname":
	        orderParams = {surname: orderSign};
	        break;
	    case "cardCode":
	        orderParams = {cardId: orderSign};
	        break;
	    case "id":
	        orderParams = {_id: orderSign};
	        break;
	}
	User.find({}).sort(orderParams).exec(function (err, docs){
		if(docs) res.send({"users": docs});
		else res.send({"result": "NO_USERS_FOUND"});
	});
});

managementApp.get('/accessControl/listEvents', function (req, res) {
    var orderString = req.query.orderBy;
    var orderField = orderString.replace(/\-/g, "");
    var orderSign = (orderString.indexOf("-") > -1)?(-1):(1);
	var orderParams = {date: -1};
	
	switch(orderField) {
	    case "user":
	        orderParams = {user: orderSign};
	        break;
	    case "date":
	        orderParams = {date: orderSign};
	        break;
	    case "event":
	        orderParams = {event: orderSign};
	        break;
	}
	var events = [];
	Event.find({}).sort(orderParams).then(function(_events) {
		var userQueries = [];
		events = _events;

		_events.forEach(function(e) {
			userQueries.push(User.findOne({_id: e.user}));
		});

		return Promise.all(userQueries);
	}).then(function(listOfUsers) {
		var results = [];
		for (var i = 0; i < listOfUsers.length; i++) {
			results.push({
				_id: events[i]._id,
			    type: events[i].type,
			    date: events[i].date,
			    user: listOfUsers[i]
			});
		}
		res.send({result: "success", events: results});
	}).catch(function(error) {
		res.status(500).send({result: "error", details: error});
	});
});

managementApp.get('/accessControl/getUserByCardCode', function (req, res) {
	User.findOne({cardId: req.query.cardCode}, function (err, doc){
		if(doc)	res.send({"result":"success", "user": doc});
		else res.send({"result": "ERROR"});
	});
});

managementApp.get('/accessControl/getUserById', function (req, res) {
	User.findOne({_id: req.query.id}, function (err, doc){
		if(doc) res.send({"result":"success", "user": doc});
		else res.send({"result": "ERROR"});
    });
});

interfaceApp.post('/accessControl/postCardCode', function (req, res) {
    var cardCode = req.body.cardCode;
    console.log("/accessControl/postCardCode [cardCode = " + cardCode + "]");
});

interfaceApp.get('/accessControl/checkCardCode/:cardCode', function (req, res) {
    var cardCode = req.params.cardCode//req.body.cardCode;
    console.log("/accessControl/checkCardCode [cardCode = " + cardCode + "]");
    User.findOne({cardId: cardCode}, function (err, doc){
    	if(doc) {
    		res.send('AUTHORIZED,'+ doc.name +',' + 'NULL' + ',fhddhdjkfhdfjkj378973897' + "\n");
    		io.sockets.emit("card_read", {"from": "device", "authorized": true, "cardCode": cardCode});
    	} else {
    		res.send('NOT_AUTHORIZED,NULL,NULL,NULL' + "\n");
    		io.sockets.emit("card_read", {"from": "device", "authorized": false, "cardCode": cardCode});
    	}
	});
});

managementApp.get('/writeCard', function (req, res) {
    var id = req.query.id;

    getDeviceIp(function(deviceAddress){
	    request('http://' + deviceAddress + '/writeCard?id=' + id, function (error, response, body) {
	        if(error || response.statusCode != 200){
	            res.send({"status": "REQUEST_ERROR", "statusCode": response.statusCode, "details": error});
	        } else {
	            res.send(body);
	        }
	    });
	}, function(err) {
		res.send({"status": "GET_DEVICE_IP_ERROR", "details": err});
	});
});

interfaceApp.get('/accessControl/checkPinCode/:cardCode/:pinCode', function (req, res) {
    var cardCode = req.params.cardCode;
    var pinCode = req.params.pinCode;

    console.log("/accessControl/checkPinCode [pinCode = " + pinCode + ", cardCode = " + cardCode + "]");

    var current_date = new Date().toISOString();

    User.findOne({ cardId: cardCode, pinCode: pinCode}, function (err, user){
    	if(user) {
    		res.send('AUTHORIZED,'+ user.name +',' + 'NULL' + ',fhddhdjkfhdfjkj378973897' + "\n");
    		io.sockets.emit("pin_code_inserted", {"from": "device", "authorized": true, "cardCode": cardCode, "pinCode": pinCode});
    		User.findOne({ cardId: cardCode}, function (_err, _user){
				var new_event = new Event({
					user: _user._id,
					date: current_date,
					type: "ACCESS_GRANTED"
				});

				new_event.save(function (__err, setting) {
					if (__err) console.log("Error saving the event on db.");
					/*else {
						getGuestsMode(function(d){
							res.send('OKAY|' + (d.enabled?"ENABLED":"DISABLED") + "|" + d.pinCode);
						}, function(err) {
							res.send("ERROR|NULL|NULL");
						});
						console.log("Device connected for the first time using ip "+ deviceAddress);
					}*/
				});
			});
    	} else {
    		res.send('NOT_AUTHORIZED,NULL,NULL,NULL' + "\n");
    		io.sockets.emit("pin_code_inserted", {"from": "device", "authorized": false, "cardCode": cardCode, "pinCode": pinCode});
    		User.findOne({ cardId: cardCode}, function (_err, _user){
				var new_event = new Event({
					user: _user._id,
					date: current_date,
					type: "ACCESS_DENIED:INCORRECT_PIN"
				});

				new_event.save(function (__err, setting) {
					if (__err) console.log("Error saving the event on db.");
					/*else{
						getGuestsMode(function(d){
							res.send('OKAY|' + (d.enabled?"ENABLED":"DISABLED") + "|" + d.pinCode);
						}, function(err) {
							res.send("ERROR|NULL|NULL");
						});
						console.log("Device connected for the first time using ip "+ deviceAddress);
					}*/
				});
			});
    	}
	});
});

interfaceApp.get('/accessControl/getGuestsMode', function (req, res) {
    res.setHeader("Content-type", "text/plain");
    getGuestsMode(function(d){
	    res.send((d.enabled?"ENABLED":"DISABLED") + "|" + d.pinCode);
	}, function(err) {
		res.send("ERROR|NULL");
	});
	console.log('/accessControl/getGuestsMode');
})

managementApp.use(function(req, res){
  res.status(404).send("<h1>Not found.</h1>")
});

var interfaceServer = http.createServer(interfaceApp);
var managementServer = https.createServer(credentials, managementApp);

interfaceServer.listen(3000);
managementServer.listen(8443);

var io = require('socket.io').listen(managementServer);
console.log('managementApp listening on port 8443\ninterfaceApp listening on port 3000');
var interfaces = os.networkInterfaces();
var addresses = [];
for (var k in interfaces) {
	for (var k2 in interfaces[k]) {
		var address = interfaces[k][k2];
        if (address.family === 'IPv4' && !address.internal) {
			addresses.push(address.address);
        }
    }
}
console.log(addresses);