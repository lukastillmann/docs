'use strict';

const recursive = require('recursive-readdir');
const minimatch = require("minimatch");
const ora = require('ora');
const inquirer = require('inquirer');
const preferences = require('preferences');
const fs = require('fs');
const argv = require('minimist')(process.argv);
const _ = require('underscore');
const nodeFetch = require('node-fetch');
const fetch = require('fetch-cookie')(nodeFetch);

const { get, post, put, putFile } = require("./request");

const request = require('request').defaults({
  jar: true
});
const qs = require('querystring');


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
    

// Load preferences
const prefs = new preferences('com.sismics.docs.importer',{
  importer: {
    daemon: false
  }
}, {
  encrypt: false,
  format: 'yaml'
});

// Welcome message
console.log('Teedy Importer 1.9, https://teedy.io' +
  '\n\n' +
  'This program let you import files from your system to Teedy' +
  '\n');

// Ask for the base URL
const askBaseUrl = () => {
  inquirer.prompt([
    {
      type: 'input',
      name: 'baseUrl',
      message: 'What is the base URL of your Teedy? (eg. https://teedy.mycompany.com)',
      default: prefs.importer.baseUrl
    }
  ]).then(answers => {
    // Save base URL
    prefs.importer.baseUrl = answers.baseUrl;

    // Test base URL
    const spinner = ora({
      text: 'Checking connection to Teedy',
      spinner: 'flips'
    }).start();

    get(answers.baseUrl + '/api/app')
        .then(json => {
          spinner.succeed('Connection OK');
          askCredentials();
        })
        .catch(error => {
            spinner.fail('Connection to Teedy failed: ' + error);
            askBaseUrl();
            return;
        });
  });
};

// Ask for credentials
const askCredentials = () => {

  inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'Account\'s username?',
      default: prefs.importer.username
    },
    {
      type: 'password',
      name: 'password',
      message: 'Account\'s password?',
      default: prefs.importer.password
    }
  ]).then(answers => {
    // Save credentials
    prefs.importer.username = answers.username;
    prefs.importer.password = answers.password;

    // Test credentials
    console.log('checking connection to Teedy');
    const spinner = ora({
      text: 'Checking connection to Teedy',
      spinner: 'flips'
    }).start();

    const data = {
      username: answers.username,
      password: answers.password,
      remember: true
    }

    post(prefs.importer.baseUrl + '/api/user/login', data)
      .then(json => {
        spinner.succeed('Authentication OK');
        askPath();
      })
      .catch(error => {
        spinner.fail('Username or password incorrect');
        askCredentials();
        return;
      })
  });
};

// Ask for the path
const askPath = () => {

  inquirer.prompt([
    {
      type: 'input',
      name: 'path',
      message: 'What is the folder path you want to import?',
      default: prefs.importer.path
    }
  ]).then(answers => {
    // Save path
    prefs.importer.path = answers.path;

    // Test path
    const spinner = ora({
      text: 'Checking import path',
      spinner: 'flips'
    }).start();
    fs.lstat(answers.path, (error, stats) => {
      if (error || !stats.isDirectory()) {
        spinner.fail('Please enter a valid directory path');
        askPath();
        return;
      }

      fs.access(answers.path, fs.W_OK | fs.R_OK, (error) => {
        if (error) {
          spinner.fail('This directory is not writable');
          askPath();
          return;
        }

        recursive(answers.path, function (error, files) {
          spinner.succeed(files.length + ' files in this directory');
          askFileFilter();
        });
      });
    });
  });
};

// Ask for the file filter
const askFileFilter = () => {

  inquirer.prompt([
    {
      type: 'input',
      name: 'fileFilter',
      message: 'What pattern do you want to use to match files? (eg. *.+(pdf|txt|jpg))',
      default: prefs.importer.fileFilter || "*"
    }
  ]).then(answers => {
    // Save fileFilter
    prefs.importer.fileFilter = answers.fileFilter;

    askTag();
  });
};

// Ask for the tag to add
const askTag = () => {

  // Load tags
  const spinner = ora({
    text: 'Loading tags',
    spinner: 'flips'
  }).start();


  get(prefs.importer.baseUrl + '/api/tag/list')
    .then(json => {

      spinner.succeed('Tags loaded');
      const tags = json.tags;
      const defaultTag = _.findWhere(tags, { id: prefs.importer.tag });
      const defaultTagName = defaultTag ? defaultTag.name : 'No tag';

      inquirer.prompt([
        {
          type: 'list',
          name: 'tag',
          message: 'Which tag to add to all imported documents?',
          default: defaultTagName,
          choices: [ 'No tag' ].concat(_.pluck(tags, 'name'))
        }
      ]).then(answers => {
        // Save tag
        prefs.importer.tag = answers.tag === 'No tag' ?
          '' : _.findWhere(tags, { name: answers.tag }).id;
        askAddTag();
      });

    })
    .catch(error => {
      spinner.fail('Error loading tags\n' + error.statusText);
      askTag();
    });

};


const askAddTag = () => {

  inquirer.prompt([
    {
      type: 'confirm',
      name: 'addtags',
      message: 'Do you want to add tags from the filename given with # ?',
      default: prefs.importer.addtags === true
    }
  ]).then(answers => {
    // Save daemon
    prefs.importer.addtags = answers.addtags;

    // Save all preferences in case the program is sig-killed
    askLang();
  });
}


const askLang = () => {

  // Load tags
  const spinner = ora({
    text: 'Loading default language',
    spinner: 'flips'
  }).start();

  get(prefs.importer.baseUrl + '/api/app')
    .then(json => {
      spinner.succeed('Language loaded');
      const defaultLang = prefs.importer.lang ? prefs.importer.lang : json.default_language;

      inquirer.prompt([
        {
          type: 'input',
          name: 'lang',
          message: 'Which should be the default language of the document?',
          default: defaultLang
        }
      ]).then(answers => {
        // Save tag
        prefs.importer.lang = answers.lang
        askCopyFolder();
      });

    })
    .catch(error => {
      spinner.fail('Connection to Teedy failed: ' + error);
      askLang();
    })

};

const askCopyFolder = () => {

  inquirer.prompt([
    {
      type: 'input',
      name: 'copyFolder',
      message: 'Enter a path to copy files before they are deleted or leave empty to disable. The path must end with a \'/\' on MacOS and Linux or with a \'\\\' on Windows. Entering \'undefined\' will disable this again after setting the folder.',
      default: prefs.importer.copyFolder
    }
  ]).then(answers => {
    // Save path
    prefs.importer.copyFolder = answers.copyFolder=='undefined' ? '' : answers.copyFolder;

    if (prefs.importer.copyFolder) {
    // Test path
    const spinner = ora({
      text: 'Checking copy folder path',
      spinner: 'flips'
    }).start();
    fs.lstat(answers.copyFolder, (error, stats) => {
      if (error || !stats.isDirectory()) {
        spinner.fail('Please enter a valid directory path');
        askCopyFolder();
        return;
      }

      fs.access(answers.copyFolder, fs.W_OK | fs.R_OK, (error) => {
        if (error) {
          spinner.fail('This directory is not writable');
          askCopyFolder();
          return;
        }
        spinner.succeed('Copy folder set!');
        askDaemon();              
      });
    });
  }
  else {askDaemon();}
  });
};

// Ask for daemon mode
const askDaemon = () => {

  inquirer.prompt([
    {
      type: 'confirm',
      name: 'daemon',
      message: 'Do you want to run the importer in daemon mode (it will poll the input directory for new files, import and delete them)?',
      default: prefs.importer.daemon === true
    }
  ]).then(answers => {
    // Save daemon
    prefs.importer.daemon = answers.daemon;

    // Save all preferences in case the program is sig-killed
    prefs.save();

    start();
  });
};

// Start the importer
const start = () => {

  const data = {
    username: prefs.importer.username,
    password: prefs.importer.password,
    remember: true
  }

  
  post(prefs.importer.baseUrl + '/api/user/login', data)
    .then(() => {
      // Start the actual import
      if (prefs.importer.daemon) {
        console.log('\nPolling the input folder for new files...');

        let resolve = () => {
          importFiles(true, () => {
            setTimeout(resolve, 30000);
          });
        };
        resolve();
      } else {
        importFiles(false, () => {});
      }

    }).catch(error => {
      console.error('\nUsername or password incorrect');
    });

};

// Import the files
const importFiles = (remove, filesImported) => {
  recursive(prefs.importer.path, function (error, files) {

    files = files.filter(minimatch.filter(prefs.importer.fileFilter || '*', { matchBase: true }));

    if (files.length === 0) {
      filesImported();
      return;
    }

    let index = 0;
    let resolve = () => {
      const file = files[index++];
      if (file) {
        importFile(file, remove, resolve);
      } else {
        filesImported();
      }
    };
    resolve();
  });
};

// Import a file
const importFile = (file, remove, resolve) => {
  const spinner = ora({
    text: 'Importing: ' + file,
    spinner: 'flips'
  }).start();

  // Remove path of file
  let filename = file.replace(/^.*[\\\/]/, '');

  // Get Tags given as hashtags from filename
  let taglist = filename.match(/#[^\s:#]+/mg);
  taglist = taglist ? taglist.map(s => s.substr(1)) : [];

  // Get available tags and UUIDs from server
  // wait a second for the login process to be finished on the server side
  sleep(1000).then(() => {
    get(prefs.importer.baseUrl + '/api/tag/list')
      .then(json => {
        let tagsarray = {};
        for (let l of json.tags) {
          tagsarray[l.name] = l.id;
        }

        // Intersect tags from filename with existing tags on server
        let foundtags = [];
        for (let j of taglist) {
          // If the tag is last in the filename it could include a file extension and would not be recognized
          if (j.includes('.') && !tagsarray.hasOwnProperty(j) && !foundtags.includes(tagsarray[j])) {
            while (j.includes('.') && !tagsarray.hasOwnProperty(j)) {
              j = j.replace(/\.[^.]*$/,'');
            }
          }
          if (tagsarray.hasOwnProperty(j) && !foundtags.includes(tagsarray[j])) {
            foundtags.push(tagsarray[j]);
            filename = filename.split('#'+j).join('');
          }
        }
        if (prefs.importer.tag !== '' && !foundtags.includes(prefs.importer.tag)){
          foundtags.push(prefs.importer.tag);
        }
        
        let data = { 
          'title': prefs.importer.addtags ? filename : file.replace(/^.*[\\\/]/, '').substring(0, 100),
          'language': prefs.importer.lang || 'eng'
        }

        if (prefs.importer.addtags) {
          data.tags = foundtags;
        }
        else {
          data.tags = prefs.importer.tag === '' ? undefined : prefs.importer.tag;
        }

        // Create document
        put(prefs.importer.baseUrl + '/api/document', data)
          .then(json => {
            // Upload file
            const fileData = {
              id: json.id,
              file: fs.createReadStream(file)
            }
            sleep(1000).then(() => {putFile(prefs.importer.baseUrl + '/api/file', fileData)
              .then(json => {
                spinner.succeed('Upload successful for ' + file);
                if (remove) {
                  if (prefs.importer.copyFolder) {
                    fs.copyFileSync(file, prefs.importer.copyFolder + file.replace(/^.*[\\\/]/, ''));
                    fs.unlinkSync(file);
                  }
                  else {fs.unlinkSync(file);}
                }
                resolve();
              })
              .catch(error => {
                spinner.fail('Upload failed for ' + file + ': ' + error.message);
                resolve();
              })
              });
            })
          .catch(error => {
            spinner.fail('Upload failed for ' + file + ': ' + error.message);
            resolve();

          })
          })
        .catch(error => {
          spinner.fail('Error loading tags');
          resolve();
        })
  })
};

// Entrypoint: daemon mode or wizard
if (argv.hasOwnProperty('d')) {
  console.log('Starting in quiet mode with the following configuration:\n' +
    'Base URL: ' + prefs.importer.baseUrl + '\n' +
    'Username: ' + prefs.importer.username + '\n' +
    'Password: ***********\n' +
    'Tag: ' + prefs.importer.tag + '\n' +
    'Add tags given #: ' + prefs.importer.addtags + '\n' +
    'Language: ' + prefs.importer.lang + '\n' +
    'Daemon mode: ' + prefs.importer.daemon + '\n' +
    'Copy folder: ' + prefs.importer.copyFolder + '\n' +
    'File filter: ' + prefs.importer.fileFilter
    );
  start();
} else {
  askBaseUrl();
}
