const http = require('http');
const https = require('https');
const btoa = require('btoa');
//const fs = require('fs');
var mysql = require('mysql');
var TEMPLATE = "{0} :\n{1}";
var whatsappPath = '/2010-04-01/Accounts/{0}/Messages.json';
var basicAuth = 'Basic {0}';
var msgOptions = {
  hostname: 'api.twilio.com',
  port: 443,
  path: '',
  method: 'POST',
  headers: {
       'Content-Type': 'application/x-www-form-urlencoded'
     }
};
// Initialize pool
var pool      =    mysql.createPool({
    connectionLimit : 10,
    host     : 'remotemysql.com',
    user     : '7IMrocUvYo',
    password : '8jUJ8cDtKv',
    database : '7IMrocUvYo',
    debug    :  false
});
function doMessage(strQuery, callback){
	//console.log(msgOptions);
	var req = https.request(msgOptions, (res) => {
	  res.on('data', (d) => {
	  });
	});

	req.on('error', (e) => {
	  console.error(e);
	});
	req.write(strQuery);
	req.end();
	callback(200);
}
function formatMsg(source, args){
	var target = '';
	target = source.replace(/\{(\d+)\}/g, function(a) {
        return args[parseInt(a.match(/(\d+)/g))];
    });
	return target;
}
function encodeURIData(strQuery){
	strQuery = strQuery.replace(/:/g, '%3A');
	strQuery = strQuery.replace(/\+/g, '%2B');
	//strQuery = strQuery.replace(/ /g, '+');
	return strQuery;
}
function executeQuery(query,callback){
	pool.getConnection(function(err,connection){
        if (err) {
          connection.release();
          throw err;
        }   
        connection.query(query,function(err,rows){
            connection.release();
            if(!err) {
                callback(null, rows);
            }else{
				console.log(err);
				callback(null);
			}
        });
        connection.on('error', function(err) {
			console.log(err);
              /*throw err;
              return;   */  
        });
    });
}
function QueryStringToJSON(str) {
	var pairs = str.split('&');
	var result = {};
	pairs.forEach(function (pair) {
		pair = pair.split('=');
		var name = pair[0]
		var value = pair[1]
		if (name.length)
			if (result[name] !== undefined) {
				if (!result[name].push) {
					result[name] = [result[name]];
				}
				result[name].push(value || '');
			} else {
				result[name] = value || '';
			}
	});
	return (result);
}
function getWhatsMessage(contact, message){
	var uriQry = '';
	var idx=0;
	uriQry +='To='+contact.mobile+'&';
	uriQry +='From=whatsapp:+14155238886&';
	var medias = contact['MediaUrls'];
	if(medias){
		medias.forEach((item) =>{
			uriQry +='MediaUrl='+item['MediaUrl']+'&'+'MediaContentType='+item['MediaContentType']+"&";
		});
	}
	/*if(contact['MediaUrl']){
		contact['MediaUrl'].forEach((mediaUrl) => {
			uriQry +='MediaUrl='+mediaUrl+'&';
		});
		
	}*/
	uriQry +='Body='+cleanBody(message);
	uriQry = encodeURIData(uriQry);
	//console.log('uriQry :: '+uriQry);
	msgOptions.path = formatMsg(whatsappPath, [ contact.auth_key]);
	msgOptions.headers['Authorization'] = formatMsg(basicAuth, [btoa(contact.auth_key+':'+contact.auth_secret)]);
	return uriQry;
}
function cleanBody(message){
	return message.replace(/\+/g, ' ');
}
function status(reqData, callback){
	//console.log('statusCallback');
	//console.log(reqData);
	var eventType = reqData['EventType'];
	if('UNDELIVERED' === eventType){
		var query = "UPDATE dronateam SET is_block = 1 WHERE mobile = '"+reqData.To+"'";
		executeQuery(query, (status, resultData)=>{
			console.log('Updated');
			callback();
		});
	}
}
function findBodyJson(reqData){
	var pos = reqData.Body.indexOf(':');
	if(pos >-1){
		reqData.Body = reqData.Body.substr(pos+1, reqData.Body.length);
	}
	var data = reqData.Body.split(':');
	reqData.BodyJson = {};
	for(var idx=0; idx<data.length; idx+=2){
		var name = data[idx];
		var bgData = data[idx+1];
		if(name === 'mobile')
			bgData = 'whatsapp:+91'+bgData;
		reqData.BodyJson[name] = bgData;
	}
}

function recieved(reqData, callback){
	if(reqData.Body.toLowerCase().startsWith('find:members')){
		findMembers(reqData, function(result){
			reqData.mobile = reqData.From;
			doMessage(getWhatsMessage(reqData, result), callback);
		});
		return;
	}
	if(!reqData.Body.toLowerCase().startsWith('find:') && !reqData.Body.toLowerCase().startsWith('add:') && !reqData.Body.toLowerCase().startsWith('del:')){
		processGroup(reqData, callback);
		return;
	}
	checkAccess(reqData, function(status){
		if(status === 401){
			//doMessage(getWhatsMessage({mobile:reqData.From}, "You must be Admin"), callback);
			return;
		}
		if(reqData.Body.toLowerCase().startsWith('find:')){
			var message = 'Contact Not Found';
			findBodyJson(reqData);
			find(reqData.BodyJson, function(result){
				if(result){
					message = formatMessage({BodyJson : result}, '');
				}
				reqData.mobile = reqData.From;
				doMessage(getWhatsMessage({mobile:reqData.From}, message), callback);
			});
		}else if(reqData.Body.toLowerCase().startsWith('add:')){
			var message = 'Contact Not Added.';
			findBodyJson(reqData);
			find(reqData.BodyJson, function(result){
				if(result){
					remove(result, function(result1){
						if(result1){
							insert(reqData.BodyJson, function(result2){
							if(result2){
								message = formatMessage(reqData, '\nAdded.');
							}
							doMessage(getWhatsMessage({mobile:reqData.From}, message), callback);
							});
						}
					});
				}else{
					insert(reqData.BodyJson, function(result1){
						if(result1){
							message = formatMessage(reqData, '\nAdded.');
						}
						doMessage(getWhatsMessage({mobile:reqData.From}, message), callback);
					});
				}
			});
		}else if(reqData.Body.toLowerCase().startsWith('del:')){
			var message = 'Contact Not Found';
			findBodyJson(reqData);
			find(reqData.BodyJson, function(result){
				if(result){
					remove(result, function(result1){
							if(result1){
								message = formatMessage(reqData, "\n Removed");
							}
						doMessage(getWhatsMessage({mobile:reqData.From}, message), callback);			
					});
				}else{
					doMessage(getWhatsMessage({mobile:reqData.From}, message), callback);			
				}
			});
		}
	});
}
function formatMessage(reqData, endMsg){
	var message = '';
	if(reqData.BodyJson.name)
		message += "Name    : "+reqData.BodyJson.name;
	if(reqData.BodyJson.mobile){
		var mobile = reqData.BodyJson.mobile.replace('whatsapp:+91','');
		message += "\nMobile   : "+mobile;
	}
	if(reqData.BodyJson.name)
		message += "\nBlocked : "+((reqData.BodyJson.is_block === 1)?'Yes':'No');
	message += endMsg;
	return message;
}
function insert(reqData, callback){
	if(!reqData.is_block)
		reqData.is_block = "0";
	if(!reqData.role)
		reqData.role = "0";
	var query = "insert into dronateam(name, mobile, is_block, role) values('"+reqData.name+"', '"+reqData.mobile+"', "+reqData.is_block+", "+reqData.role+")";
	executeQuery(query, (status, resultData)=>{
		callback(resultData);
	});
}
function remove(reqData, callback){
	var query = "delete from dronateam where mobile='"+reqData.mobile+"'";
	executeQuery(query, (status, resultData)=>{
		callback(resultData);
	});
}
function checkAccess(reqData, callback){
	var query = "select role,is_block from dronateam where mobile='"+reqData.From+"'";
	executeQuery(query, (status, resultData)=>{
		var result = resultData[0];
		if(result.role === 0){
			callback(401);
		}else{
			callback(200);
		}
	});
}
function find(reqData, callback){
	var isAnd = false;
	var query = "select mobile,name,role,is_block from dronateam where ";
	if(reqData.mobile){
		query +="mobile='"+reqData.mobile+"'";
		isAnd = true;
	}
	if(reqData.name){
		if(isAnd)
			query +=" AND ";
		query +="name='"+reqData.name+"'";
	}
	executeQuery(query, (status, resultData)=>{
		var result;
		if(resultData.length > 0)
			result = resultData[0];
		callback(result);
	});
}
function findMembers(reqData, callback){
	var query = "select dt.name, dt.mobile,dr.auth_key, dr.auth_secret from dronateam dt, dronaroom dr where dt.is_block = 0 and dt.room = dr.room";
	executeQuery(query, (status, resultData)=>{
		var result = 'Group Members\n';
		resultData.forEach((item, index) =>{
			if(item.mobile === reqData.From){
				reqData.auth_key = item.auth_key;
				reqData.auth_secret = item.auth_secret;
				return;
			}
			result += "Name : "+item.name+"\n";
		});
		callback(result);
	});
}
function unBlockSender(sender){
	if(sender.is_block === 1){
		var query = "UPDATE dronateam SET is_block = 0 WHERE name = '"+sender.name+"'";
		executeQuery(query, (status, resultData)=>{
			console.log('Updated');
		});
	}
}
function processGroup(reqData, callback){
	var group = [];
	var sender;
	executeQuery('select dt.is_block, dt.name, dt.mobile, dt.role, dr.auth_key, dr.auth_secret from dronateam dt, dronaroom dr where dt.room = dr.room', (status, result)=>{
		result.forEach((item, index) =>{
			if(reqData.From === item.mobile){
				sender = item;
				return;
			}
			if(item.is_block !== 0)
				return;
			group.push(item);
			
		});
		unBlockSender(sender);
		//console.log(sender);
		var message = formatMsg(TEMPLATE, [ sender.name, reqData.Body ]);
		//console.log("message :: "+message);
		var MediaContentType0 = reqData["MediaContentType0"];
		var mediaUris = [];
		if (MediaContentType0 != null && MediaContentType0.trim().length > 0) {
			var idx=0;
			while(reqData["MediaUrl"+idx] !== undefined){
				mediaUris.push({"MediaUrl" : reqData["MediaUrl"+idx], "MediaContentType" : reqData["MediaContentType"+idx]});
				idx++;
			}
		}
		group.forEach((item, index) =>{
			if (mediaUris.length > 0) {
				item['MediaUrls'] = mediaUris;
			}
			doMessage(getWhatsMessage(item, message), callback);
			return;
		});
	});
}

http.createServer(function (req, res) {
	var fMsg = "Message sent\n";
	var body = [];
	//console.log(req.url);
	if(req.method === 'POST'){
		req.on('data', (chunk) => {
		body.push(chunk);
		}).on('end', () => {
			var bodyMsg = Buffer.concat(body).toString('utf8');
			console.log(bodyMsg);
			var reqData = QueryStringToJSON(decodeURIComponent(bodyMsg));
			if('/recieved' === req.url){
				recieved(reqData, (status)=> {
					res.writeHead(status);
					res.end(fMsg);
				});
			}else if('/status' === req.url){
				status(reqData, ()=> {
					res.writeHead(200);
					res.end(fMsg);
				});
			}
			//console.log(fMsg);
		  
		});
	}else{
		res.end('Requested resource Not available.');
		res.writeHead(404);
	}
}).listen(8080);
