/**
 * The application entry point
 */

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import domainMiddleware from 'express-domain-middleware';
import {errorHandler, notFoundHandler} from 'express-api-error-handler';
import config from 'config';
import './bootstrap';
import routes from './routes';
import loadRoutes from './common/loadRoutes';
import logger from './common/logger';
import extend from 'extend';
var request = require('request');

const app = express();
app.set('port', config.PORT);

//respond with "hello world" when a GET request is made to the homepage
app.get('/', function (req, res) {
  res.send('hello not so big world, lol<br/><pre>'+'</pre>');
});

function makeTranslation(sourceText,sourceLanguageCode,destinationLanguageCode,sourceTextTone,translatedText,translatedTextTone){
	return { 'Translation':{
			'properties': {
	    		'sourceText':	sourceText
	    		,'sourceLanguageCode':	sourceLanguageCode
	    		,'destinationLanguageCode':	destinationLanguageCode
	    		,'sourceTextTone':	sourceTextTone
	    		,'translatedText':	translatedText
	    		,'translatedTextTone':	translatedTextTone
	    	}	
	    } 
	};
}
function makeError(code,message){
	return { 'Error':{
			'properties': {
	    		'code':	code
	    		,'message':	message
	    	}	
	    } 
	};
}

//========================================================================

var LanguageTranslatorV2 = require('watson-developer-cloud/language-translator/v2');
console.log(JSON.stringify(LanguageTranslatorV2));
var translator = new LanguageTranslatorV2({
  // If unspecified here, the LANGUAGE_TRANSLATOR_USERNAME and LANGUAGE_TRANSLATOR_PASSWORD environment properties will be checked
  // After that, the SDK will fall back to the bluemix-provided VCAP_SERVICES environment property
  // username: '<username>',
  // password: '<password>'
  url: 'https://gateway.watsonplatform.net/language-translator/api'/*,
  use_unauthenticated: process.env.use_unauthenticated === 'true'*/
});


/*
3. Create a GET API request with 2 endpoints
- /api/translate
- /api/history
*/

app.get('/api/translate',  function(req, res, next) {
  console.log('/v2/translate');

  var textSource = {'source':req.query.sourceLanguageCode, 'target':req.query.destinationLanguageCode,'text':req.query.sourceText};

  //check if inputs are defined
  if(req.query.sourceLanguageCode != null && req.query.destinationLanguageCode != null && req.query.sourceText != null)
	  res.status(400).json(makeError('400','sourceLanguageCode, destinationLanguageCode and sourceText must be defined.'));
  //check if inputs are non-empty
  if(req.query.sourceLanguageCode === '' || req.query.destinationLanguageCode === '' || req.query.sourceText === '')
	  res.status(400).json(makeError('400','sourceLanguageCode, destinationLanguageCode and sourceText must be non-empty.'));
  //check if language code exists
  translator.getIdentifiableLanguages(null,
		  function(err, languages) {
	    if (err)
	      console.log(err)
	    else {
		      var sourceLanguageCodeOK = false;
		      var targetLanguageCodeOK = false;
		      for (lang in languages) { 
			        if(lang.language === textSource.source)
			        	sourceLanguageCodeOK = true;
			      }
		      for (lang in languages) { 
			        if(lang.language === textSource.target)
			        	targetLanguageCodeOK = true;
			      }
		      if(!sourceLanguageCodeOK || !targetLanguageCodeOK)
		    	  res.status(400).json(makeError('400','Invalid sourceLanguageCode or destinationLanguageCode and sourceText must be non-empty.'));
	    }
	});
  //check if language pair is OK
  translator.getModels({'source':textSource.source,'target':textSource.target}, function(err, models) {
    if (err)
      console.log(err)
    else {
      if(models.models.length === 0){
      	  res.status(400).json(makeError('400','Invalid sourceLanguageCode / destinationLanguageCode combination.'));
      }
    }
});
  
  var params = extend({ 'X-WDC-PL-OPT-OUT': req.header('X-WDC-PL-OPT-OUT')}, textSource);
  translator.translate(params, function(err, models) {
    if (err)
      return next(err);
    else {
      res.status(200).json(makeTranslation(textSource.text,textSource.source,textSource.target,'SourceTone',models.translations[0].translation,'TargetTone'));
      //push into DB
    }
  });
});

app.get('/api/history',  function(req, res, next) {
	  console.log('/v2/history');
	  res.send('history<br/><pre>'+'</pre>');
});

/*
4. Implement the API defined in the attached Swagger doc.  You may use editor.swagger.io generators if you wish.  
You also do not have to follow the API to the letter.  
As long as the inputs and outputs work as required, you are welcome to make additions or corrections as you see fit.
*/

/*
5. Create a very simple UI that uses the above Api. A sample UI screenshot are provided below. 
UI is provided for demonstration only, and not necessarily to implement as is. Feel free to experiment with the UI.  
You will not be critiqued on the design of your UI, only the functionality surfaced in it.
*/

//========================================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(domainMiddleware);


const apiRouter = new express.Router();

loadRoutes(apiRouter, routes);

app.use('/api', apiRouter);

app.use(errorHandler({
  log: ({err, req, body}) => {
    logger.error(err, `${body.status} ${req.method} ${req.url}`);
  },
}));

app.use(notFoundHandler({
  log: ({req}) => {
    logger.error(`404 ${req.method} ${req.url}`);
  },
}));

if (!module.parent) {
  app.listen(app.get('port'), () => {
    logger.info(`Express server listening on port ${app.get('port')} in ${process.env.NODE_ENV} mode`);
  });
}

export default app;
