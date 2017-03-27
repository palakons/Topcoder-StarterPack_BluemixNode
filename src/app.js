/**
 * The application entry point
 */

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import domainMiddleware from 'express-domain-middleware';
import { errorHandler, notFoundHandler } from 'express-api-error-handler';
import config from 'config';
import './bootstrap';
import routes from './routes';
import loadRoutes from './common/loadRoutes';
import logger from './common/logger';
import extend from 'extend';
var request = require('request');
var http = require('http');
var Cloudant = require('cloudant');
var stylus = require('stylus');
var nib = require('nib');


const app = express();
app.set('port', config.PORT);


app.set('view engine', 'jade');
function compile(str, path) {
	return stylus(str)
		.set('filename', path)
		.use(nib())
}
app.set('views', __dirname + '/../views')
app.set('view engine', 'jade')
//app.use(express.logger('dev'))
app.use(stylus.middleware(
	{
		src: __dirname + '/../public'
		, compile: compile
	}
))
app.use(express.static(__dirname + '/../public'));

app.get('/', function (req, res) {
	var languages = JSON.parse(JSON.stringify(availableLanguages));
	languages.languages = [];
	//-----
	translator.getModels({ 'source': 'en' }, function (err, models) {
		if (err)
			console.log(err)
		else {
			console.log('models');
			var langSet = new Set();
			for (var i in models.models) {
				langSet.add(models.models[i].target);
			}

			for (let item of langSet) {
				if (langList[item] != undefined) {
					languages.languages.push(langList[item]);
				} else {
					console.log('Cannot find: ' + item);
				}
			}
			console.log(JSON.stringify(languages.languages));
			var params = extend({ title: 'COGNATIVE COMPANY' }, languages);
			res.render('index', params);
		}
	});

});


// FUNCTIONS ================================================
function makeTranslation(sourceText, sourceLanguageCode, destinationLanguageCode, sourceTextTone, translatedText, translatedTextTone) {
	return {
		'Translation': {
			'sourceText': sourceText
			, 'sourceLanguageCode': sourceLanguageCode
			, 'destinationLanguageCode': destinationLanguageCode
			, 'sourceTextTone': sourceTextTone
			, 'translatedText': translatedText
			, 'translatedTextTone': translatedTextTone
		}
	};
}
function makeError(code, message) {
	return {
		'Error': {
			'code': code
			, 'message': message
		}
	};
}

//create a database
var createDatabase = function (callback) {
	console.log("Creating database '" + dbname + "'");
	cloudant.db.create(dbname, function (err, data) {
		console.log("Error:", err);
		console.log("Data:", data);
		db = cloudant.db.use(dbname);
		callback(err, data);
	});

};

//create a document
var createDocument = function (data, callback) {
	console.log("Creating document");
	db.insert(data, function (err, data) {
		console.log("Error:", err);
		console.log("Data:", data);
		callback(err, data);
	});
};


//read a document
var readDocument = function (params, callback) {
	console.log("Reading document");
	db.list({ include_docs: true }
		, function (err, data) {
			console.log("Error:", err);
			console.log("Data:", data);

			callback(err, data);
		});
};

// ========================================================================

var LanguageTranslatorV2 = require('watson-developer-cloud/language-translator/v2');
var translator = new LanguageTranslatorV2({
	// If unspecified here, the LANGUAGE_TRANSLATOR_USERNAME and
	// LANGUAGE_TRANSLATOR_PASSWORD environment properties will be checked
	// After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES
	// environment property
	// username: '<username>',
	// password: '<password>'
	url: 'https://gateway.watsonplatform.net/language-translator/api'
});

var availableLanguages = null;
var langList = {};

translator.getIdentifiableLanguages(null,
	function (err, languages) {
		if (err)
			console.log(err)
		else {
			availableLanguages = JSON.parse(JSON.stringify(languages));
			//inverse lang list
			for (var i in availableLanguages.languages) {
				langList[availableLanguages.languages[i].language] = availableLanguages.languages[i];
			}
		}
	});


var ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');
var toneAnalyzer = new ToneAnalyzerV3({
	// If unspecified here, the TONE_ANALYZER_USERNAME and
	// TONE_ANALYZER_PASSWORD environment properties will be checked
	// After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES
	// environment property
	// username: '<username>',
	// password: '<password>',
	version_date: '2016-05-19'
});

var dbname = 'history';
var db = null;
//Obtain the db interface from VCAP_SERVICES
if (process.env.VCAP_SERVICES) {
	// Running on Bluemix. Parse the process.env for the port and host that we've been assigned.
	var env = JSON.parse(process.env.VCAP_SERVICES);
	console.log('VCAP_SERVICES: ', env);
	// Also parse out Cloudant settings.
	var cloudant = Cloudant(env['cloudantNoSQLDB'][0]['credentials']);
	console.log(cloudant);

	cloudant.db.list(function (err, allDbs) {
		console.log('All my databases: %s', allDbs.join(', '))
	});
}
createDatabase(function (err, data) {
	if (err && err.statusCode != 412) { //error or db existed
		console.log('DB Create Error ' + JSON.stringify(err));
	}
});

/*
 * 3. Create a GET API request with 2 endpoints - /api/v1/translate - /api/v1/history
 */

app.get('/api/v1/translate', function (req, res, next) {
	console.log('/v1/translate');

	var textSource = { 'source': req.query.sourceLanguageCode, 'target': req.query.destinationLanguageCode, 'text': req.query.sourceText };

	console.log('input obj');
	console.log(JSON.stringify(req.query));
	// check if inputs are defined
	if (req.query.sourceLanguageCode == undefined || req.query.destinationLanguageCode == undefined || req.query.sourceText == undefined) {
		res.status(400).json(makeError('400', 'sourceLanguageCode,destinationLanguageCode and sourceText must be defined.'));
	}
	// check if inputs are non-empty
	else if (req.query.sourceLanguageCode == '' || req.query.destinationLanguageCode == '' || req.query.sourceText == '') {
		res.status(400).json(makeError('400', 'sourceLanguageCode, destinationLanguageCode and sourceText must be non-empty.'));
	} else {

		// check if language code exists
		var sourceLanguageCodeOK = false;
		var targetLanguageCodeOK = false;
		console.log('check if languageCodes valid');
		for (var i in availableLanguages.languages) {
			var ele = availableLanguages.languages[i];
			if (ele.language === textSource.source) {
				sourceLanguageCodeOK = true;
				console.log('matched: ' + textSource.source);
			}
			if (ele.language === textSource.target) {
				targetLanguageCodeOK = true;
				console.log('matched: ' + textSource.target);
			}
		}
		if (!sourceLanguageCodeOK || !targetLanguageCodeOK)
			res.status(400).json(makeError('400', 'Invalid sourceLanguageCode or destinationLanguageCode.'));
		else
			// check if language pair is OK
			translator.getModels({ 'source': textSource.source }, function (err, models) {
				if (err)
					console.log(err)
				else {
					console.log('check if language pair is OK');
					var foundPair = false;
					for (var i in models.models) {
						if (models.models[i].target === textSource.target) {
							foundPair = true;
							break;
						}
					}
					if (!foundPair) {
						res.status(400).json(makeError('400', 'Invalid sourceLanguageCode / destinationLanguageCode combination.'));
					} else {
						var params = extend({ 'X-WDC-PL-OPT-OUT': req.header('X-WDC-PL-OPT-OUT') }, textSource);
						translator.translate(params, function (err, models) {
							if (err)
								return next(err);
							else {
								console.log('traslation done');
								var sourceTone = null;
								var targetTone = null;
								// call tone analyzer to source text
								toneAnalyzer.tone({ text: textSource.text },
									function (err, tone) {
										if (err)
											console.log(err);
										else {
											console.log('got originalTone');
											sourceTone = tone;
											// call tone analyzer to translated text
											toneAnalyzer.tone({ text: models.translations[0].translation },
												function (err, tone) {
													if (err)
														console.log(err);
													else {
														console.log('got translatedTone');
														targetTone = tone;
														// now we have all data
														var translationOutput = extend({ 'time': Date.now(), 'destinationLanguage': langList[textSource.target].name, 'sourceLanguage': langList[textSource.source].name }, makeTranslation(textSource.text, textSource.source, textSource.target, sourceTone, models.translations[0].translation, targetTone));
														// push into DB
														createDocument(translationOutput, function (err, data) {
															if (err) {
																res.json(err);
															}
														});
														res.status(200).json(translationOutput);
													}
												});
										}
									});
							}
						});
					}
				}
			});
	}
});


app.get('/api/v1/history', function (req, res, next) {
	console.log('/v1/history');
	var limit = req.query.num ? req.query.num : 5;
	limit = Math.min(100, limit);

	readDocument({ 'limit': limit }, function (err, data) {
		if (err) {
			res.json(err);
		} else {
			console.log('/rad data ok');
			//process data
			var translations = new Array();
			data.rows.sort(function (a, b) {
				return b.doc.time - a.doc.time;
			});
			for (var i in data.rows) {
				translations.push({ 'Translation': extend(data.rows[i].doc.Translation, { 'destinationLanguage': langList[data.rows[i].doc.Translation.destinationLanguageCode].name }) });
				if (i == limit - 1)
					break;
			}
			res.json(translations);
		}
	});

});

// ========================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(domainMiddleware);


const apiRouter = new express.Router();

loadRoutes(apiRouter, routes);

app.use('/api', apiRouter);

app.use(errorHandler({
	log: ({ err, req, body }) => {
		logger.error(err, `${body.status} ${req.method} ${req.url}`);
	},
}));

app.use(notFoundHandler({
	log: ({ req }) => {
		logger.error(`404 ${req.method} ${req.url}`);
	},
}));

if (!module.parent) {
	app.listen(app.get('port'), () => {
		logger.info(`Express server listening on port ${app.get('port')} in ${process.env.NODE_ENV} mode`);
	});
}

export default app;
