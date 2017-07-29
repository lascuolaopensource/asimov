const MPR121 = require('adafruit-mpr121');
const LCD = require('./i2c-lcd.js');
const http = require('http');
const pn532 = require('pn532');
const SerialPort = require('serialport');
const PiServo = require('pi-servo');
const Gpio = require('pigpio').Gpio;
const lcd = new LCD('/dev/i2c-1', 0x27);

const mpr121 = new MPR121(0x5A, 1);
const serialPort = new SerialPort('/dev/ttyS0', { baudrate: 115200 });
const rfid = new pn532.PN532(serialPort);
const servo1 = new Gpio(4, {mode: Gpio.OUTPUT});
const servo2 = new Gpio(18, {mode: Gpio.OUTPUT});

var loading = false;
var passInput = false;
var password = '';
var uid = '';
var servoClosedPos = 1000;
var servoOpenedPos = 2400;

lcd.print("Caricamento...").setCursor(0,0);
closeDoor();


mpr121.setThresholds(100, 6);

mpr121.on('touch', (pin) => 
{
	console.log('pin ' + pin);
		
	if(passInput){
		if(pin < 10){
			password += pin;
			console.log('length: ' + password.length);
			lcd.setCursor(0,1).print('    ').setCursor(0,1).print(password.replace(/\./gi, '*'));
			if(password.length === 4){
				console.log('pass done');
				
				var options = {
					host: '192.168.1.2',
					port: 3000,
					path: '/accessControl/checkPinCode/' + uid + '/' + password
				};
					
				loading = true;
				http.get(options, (resp) =>
				{
					resp.on('data', (chunk) =>
					{
						
						var data = '';
						
						
						for(var i=0;i<chunk.length;++i)data += String.fromCharCode(chunk[i]);
						console.log(data);
						lcd.clear();
						if(data.split(',')[0] === 'AUTHORIZED'){
							openDoor();
							lcd.print('Benvenuto!');
							setTimeout(()=>	
							{
								closeDoor();
							}, 3000);
						}
						else{
							lcd.print('Accesso negato');
						}
						setTimeout(()=>
						{
							lcd.clear();
							lcd.print('Avvicinare card');
						}, 3000);
						loading = false;
					});
				}).on("error", (e) =>
				{
					console.log("Got error: " + e.message);
					loading = false;
				});	
			}
		}
	}
});


rfid.on('ready', () => 
{	
	lcd.print("Avvicinare card").setCursor(0,1);
	console.log('Listening for a tag scan...');
    rfid.on('tag', (tag) =>
    {
		if(!loading){
		
			lcd.clear();
			lcd.print('Caricamento...');
			console.log('tag:', tag.uid);

			uid = tag.uid;
			uid = '0x' + uid.toUpperCase().replace(new RegExp(':', 'g'), '-0x') + '-0x00-0x00';

			var options = {
			  host: '192.168.1.2',
			  port: 3000,
			  path: '/accessControl/checkCardCode/'
			};

			options.path += uid;
			loading = true;
			
			http.get(options, (resp) =>
			{
				resp.on('data', (chunk) =>
				{
					var data = '';
					
					for(var i=0;i<chunk.length;++i)data += String.fromCharCode(chunk[i]);
					
					console.log(data);
					
					if(data.split(',')[0] === 'AUTHORIZED')
					{
						lcd.clear();
						lcd.print("Inserire pin.").setCursor(0,1); //.print("----");	
						password = '';
						passInput = true;
					}
					else
					{
						lcd.clear();
						lcd.print('Accesso negato');
						setTimeout(()=>{
							lcd.clear();
							lcd.print('Avvicinare card');
						}, 3000);
					}
					loading = false;
				});
			}).on("error", (e) =>
			{
				loading = false;
				console.log("Got error: " + e.message);
			});
		}
	});
});


function openDoor(){
	servo1.servoWrite(2500);
	servo2.servoWrite(500);
}

function closeDoor(){
	servo1.servoWrite(2000);
	servo2.servoWrite(1000);
}
