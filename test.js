var passInput = false;
var password = '';

const MPR121 = require('adafruit-mpr121'),
      mpr121  = new MPR121(0x5A, 1);
      mpr121.setThresholds(100, 6);
       
mpr121.on('touch', (pin) => {
		console.log('pin ' + pin 'touched');
		
		if(passInput){
			if(pin < 10){
			password += pin;
			}
		}
	});

var LCD = require('./i2c-lcd.js');

var lcd = new LCD('/dev/i2c-1', 0x27);

lcd.print("Avvicinare card").setCursor(0,1);

var http = require('http');
var options = {
  host: '192.168.1.2',
  port: 3000,
  path: '/accessControl/checkCardCode/'
};


var pn532 = require('pn532');
var SerialPort = require('serialport');

var serialPort = new SerialPort('/dev/ttyS0', { baudrate: 115200 });
var rfid = new pn532.PN532(serialPort);

rfid.on('ready', function() {
    console.log('Listening for a tag scan...');
    rfid.on('tag', function(tag) {
        console.log('tag:', tag.uid);

		var uid = tag.uid;
		uid = '0x' + uid.toUpperCase().replace(new RegExp(':', 'g'), '-0x') + '-0x00-0x00';

		options.path += uid;

		http.get(options, function(resp){
		resp.on('data', function(chunk){
		
			var resp = '';
			for(var i=0;i<chunk.length;++i)resp += String.fromCharCode(chunk[i]);
			lcd.clear();
			lcd.print("Inserire pin.").setCursor(0,1).print("----");
			console.log(resp);
			var data = resp.split(',');
			console.log(data[0]);
			if(data[0] === 'AUTHORIZED'){
				
				options.path = options.path.replace('Card', 'Pin') + '/1410';
				
				http.get(options, function(resp){
					resp.on('data', function(chunk){
						for(var i=0;i<chunk.length;++i)resp += String.fromCharCode(chunk[i]);
						console.log(resp);
					});
				}).on("error", function(e){
						console.log("Got error: " + e.message);
				});	
			}
		});
	}).on("error", function(e){
			console.log("Got error: " + e.message);
		});
    });
});
