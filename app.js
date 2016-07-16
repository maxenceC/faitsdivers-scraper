var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var Allcomics = [];

//++++++++++  -----------------  ++++++++++//
//++++++++++        DB           ++++++++++//
//++++++++++  -----------------  ++++++++++//

var mongoose = require('mongoose');
autoIncrement = require('mongoose-auto-increment');
mongoose.connect('mongodb://localhost/test');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function () {
    // we're connected!
    console.info('db connected');
});

autoIncrement.initialize(db);


//++++++++++  -----------------  ++++++++++//
//++++++++++        Models       ++++++++++//
//++++++++++  -----------------  ++++++++++//


var articlesSchema = mongoose.Schema({
    titre: String,
    date: String,
    img: String,
    lien: String,
    text: String,
    createdAt: Date
});

articlesSchema.plugin(autoIncrement.plugin, 'Articles');

articlesSchema.methods.getTitre = function () {
    return this.titre()
};

var Articles = mongoose.model('Articles', articlesSchema);

//++++++++++  -----------------  ++++++++++//
//++++++++++      Endpoints      ++++++++++//
//++++++++++  -----------------  ++++++++++//

var app = express();

app.set('port', 8080);
app.listen(app.get('port'));

/* GET home page. */
app.get('/comics', function (req, res, next) {
    return res.status(200).send({comics: Allcomics});
});

app.get('/fetch', function (req, res, next) {
    console.info('start scrapping');
    Allcomics = [];
    scrapeTargetPage('http://www.faitsdivers.org/');
    return res.status(200).send({});
});

app.get('/articles', function (req, res, next) {
    Articles.find(function (err, articles) {
        if (err) {
            console.log(err.message);
            return res.status(500).send({});
        }

        return res.status(200).send({articles: articles});

    });
});

//++++++++++  -----------------  ++++++++++//
//++++++++++  Express boilerplate ++++++++++//
//++++++++++  -----------------  ++++++++++//

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
});


//++++++++++  -----------------  ++++++++++//
//++++++++++     scraper         ++++++++++//
//++++++++++  -----------------  ++++++++++//

var scraperjs = require('scraperjs');
var scrapRouter = new scraperjs.Router();

var createPostEntries = function (articles) {

    if (articles.length === 0) {
        return;
    }

    Articles.findOne().sort({createdAt: -1}).exec(function (error, article) {

        if (error) {
            console.log(error.message);
            return;
        }

        if (article && article.titre === articles[0].titre) {
            console.log('no new articles')
        } else {
            console.info('start building articles');
            console.time('entries');

            const page = articles.forEach(function (page) {
                scraperjs.StaticScraper.create(page.lien)
                    .scrape(function ($) {
                        const text = $("#contenerleft").find('#article p').text();
                        const source = $("#contenerleft").find('.source a').attr('href');

                        page.text = text;
                        page.source = source;

                        return page
                    })
                    .then(function (newPage) {
                        const newArticle = new Articles(newPage);
                        newArticle.createdAt = new Date();

                        Articles.findOne({titre: newArticle.titre}, function (err, result) {
                            if (!err && !result) {
                                newArticle.save(function (err) {
                                    if (err) {
                                        console.log(err);
                                    } else {
                                        console.log('article saved succesfully');
                                    }
                                });
                            }
                        });
                    });
            });
            console.info('stop building articles, built in ');
            console.timeEnd('entries');
        }
    });
};

var scrapeTargetPage = function (page) {
    scraperjs.StaticScraper.create(page)
        .scrape(function ($) {

            var shouldContinue = true;
            var nextPage;
            var comicsLinks = [];

            //$('.pagesuivante').children().attr('href')

            if ($('.pagesuivante').children().attr('href')) {
                nextPage = 'http://www.faitsdivers.org/' + $('.pagesuivante').children().attr('href');

                console.log('next page : ' + nextPage);


                comicsLinks = $(".unarticle").map(function () {
                    const titre = $(this).find('.titrearticle a').text();
                    const lien = 'http://www.faitsdivers.org/' + $(this).find('.titrearticle a').attr('href');
                    const date = $(this).find('.heure').text();
                    const img = 'http://www.faitsdivers.org/' + $(this).find('.imagearticle img').attr('src');

                    return {
                        titre: titre,
                        img: img,
                        lien: lien,
                        heure: date
                    };

                }).get();
            } else {
                shouldContinue = false;
                comicsLinks = [];
            }

            return {comics: comicsLinks, nextPage: nextPage, shouldContinue: shouldContinue}
        })
        .then(function (comics) {
            Allcomics = Allcomics.concat(comics.comics);
            if (comics.shouldContinue) {
                //scrapeTargetPage(comics.nextPage)

                // for debug :
                createPostEntries(Allcomics);
            } else {
                console.log('done scraping');
                //createPostEntries(Allcomics);
            }
        });
};


module.exports = app;





