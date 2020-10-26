#!/usr/bin/env node

/*
  bundle builder
*/

require('./common');
const fs              = require('fs');
const md5             = require('md5-file');
const colors          = require('colors');
const {spawn, exec}   = require('child_process');
const uploader        = require('./uploader');
const readlline       = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const Spinner         = require('cli-spinner').Spinner;
const spinner         = new Spinner('Processing... %s    ');
spinner.setSpinnerString( 18 );

const PATH            = process.cwd();
const SupportedOS     = ['ios','android'];

const PACKAGE_PATH        = PATH + '/node_modules/react-native/package.json';
const LOCAL_PACKAGE_PATH  = PATH + '/package.json';
const LOCAL_PACKAGE_KEY   = 'bundle-ota';
const IOS_BUNDLE_PATH     = 'ios/bundle';
const OTA_SERVER          = 'ota-server';
const ANDROID_BUNDLE_PATH = 'android/app/src/main/assets';

const [locale]        = (process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || process.env.LANGUAGE).split('.');
const Strings         = require('./localizations.json')[locale];

const BundleMakerError = (reason)=>{
  console.log(reason);
  help();
  return process.exit();
}

const saveJson = ( o, path ) =>{
  return new Promise( (r,j)=> fs.writeFile(PATH + '/' + path,JSON.stringify( o, undefined, 2 ),'utf8',(err, data)=>err ? j( err ) : r() ) )
  .then(()=> console.log( (path + ' saved').gray ) )
  .catch(e=> console.warn( e ) )
}

const readJson = (path)=>new Promise( r=> fs.readFile( PATH + '/' + path,(err,data)=> r( data ? JSON.parse( data ) : null ) ) );

const booleanParser = (v, d)=>( typeof v == 'undefined' ) ? d : v.startsWith('y');

const Commands = [
  {  name:'init',                  description:'Initialize property for bundle build.', parser:()=>true},
  {  name:'ios',     shortcut:'i', description:'Build iOS bundle with version.', parser:v=>v ? v.versionNormalize() : 'null'},
  {  name:'android', shortcut:'a', description:'Build Android bundle.', parser:v=>v ? v.versionNormalize() : 'null'},
  {  name:'upload',  shortcut:'u', description:'Upload bundle when build finished.', parser:v=>booleanParser(v,true)},
  {  name:'reset',   shortcut:'r', description:'Reset cache when bundle build.', parser:v=>booleanParser(v,true)},
  {  name:'path',    shortcut:'p', description:'Specify bundle build path.', parser:v=>v},
  // {  name:'dev',     shortcut:'d', description:'Set developement bundle.', parser:v=>booleanParser(v,true)},
  {  name:'recent',  shortcut:'t', description:'All sequence running automatic with recent options.',parser:()=>true},
  {  name:'help',    shortcut:'h', description:'Help', parser:()=>true},
];

const help = ()=>{
  const max = Commands.reduce((p,{name})=>Math.max(p,name.length),-1);
  console.log( '' )
  console.log( '  Usage: rn-ota [ios] [android] [options] \n')
  console.log( '  Usage: ota [ios] [android] [options] \n')
  console.log( '  Options \n');
  console.log(
    Commands.map(c=>'      ' + (c.shortcut ? c.shortcut.bold + ', ' :  '   ') + c.name.rpad( max ).bold + ' : ' + c.description ).join('\n')
  );
  console.log( '\n\n');
  process.exit();
}

const say = (text)=>execPromise('say "' + text + '"' );

const execPromise = ( command ) =>new Promise( (r,j)=>exec( command, (e, stdout, stderr )=>e ? j(e) : r() ) );

const Q = (q, expected, notRepeat, defaultValue)=>{
  return new Promise( r=>{
    readlline.question( q, a=>{
      if( expected ) {
        if( a && ( expected.indexOf( a.toLowerCase().trim() ) > -1 ) )
          r( a.toLowerCase().trim() );
        else if( notRepeat ) r( null );
        else {
          console.log( '"' + a.red + '" is not expected answer. Should be one of ' + expected.join(',') + '.' );
          r( Q( q, expected) )
        }
      }
      else {
        if( a.length > 0 )   r( a );
        else if( notRepeat ) r( null );
        else if( defaultValue ) r( defaultValue );
        else {
          console.log( 'Please answer ');
          r( Q( q, expected) );
        }
      }
    })
  })
}

var commands = process.argv.limit(2)                            // cut arguments
  .map(a=>a.split(/:|=/ig))                                       // split key and value
  .map(([k,v])=>({k:k.replace(/-/ig,''), v:v}))                   // normalize value
  .map(({k,v})=> ({
    c:Commands.find(({name:n,shortcut:s})=>n == k || s == k ),v
  }))
  .filter(c=>c.c)                                                 // filter default commands
  .map(({c,v})=>({c,v:c.parser(v)}))
  .reduce((p,{c,v})=>Object.assign(p,{[c.name]:v}),{});           // merge Object

// console.log( JSON.stringify( {commands}) );
if( commands.help ) help();

if( !fs.existsSync( PACKAGE_PATH ) && fs.existsSync( LOCAL_PACKAGE_PATH ) ) BundleMakerError('Can`t find react-native project.'.bold.red);

const rnPackage           = require( PACKAGE_PATH );
const localPackage        = require( LOCAL_PACKAGE_PATH );
const builderPackage      = require(process.mainModule.paths[0].split('/').replace(-1, 1, 'package.json').join('/'));
const bundleProperties    = localPackage[LOCAL_PACKAGE_KEY];

const runPackager = ( opts )=>{
  say(Strings.build[opts.os]);
  let path = (opts.path + '/bundle').replace('//','/');
  let entryFile = fs.existsSync( `${PATH}/index.tsx`) ? 'index.tsx': 
                  fs.existsSync( `${PATH}/index.js`) ? 'index.js': 
                  fs.existsSync( `${PATH}/index.${opts.os}.js`) ? `index.${opts.os}.js`: null;
  if( !entryFile ) BundleMakerError(`Can\`t find entry file atleast one of index.js, index.tsx, index.${opts.os}.js.`);
  return execPromise('mkdir -p ' + path )
  .then(()=>{
    spinner.start();
    let bundleCommand = [
      'node',
      './node_modules/react-native/local-cli/cli.js',
      'bundle',
      // '--entry-file', rnPackage.version.versionToNumber() <= 4604 ? '"index.' + opts.os + '.js"' : '"index.js"',
      '--platform', opts.os,
      opts.resetCache ? '--reset-cache' : '',
      '--dev', opts.isDev ? 'true' : 'false',
      '--bundle-output', '"'  + path + '/main.jsbundle"',
      '--assets-dest', '"' + path + '"',
    ].filter(e=>e);
    // console.log( bundleCommand.join('\n'));
    return execPromise(bundleCommand.join(' '));
  })
  .then(()=>{
    spinner.stop( true );
    console.log('\n');
  })
}

const init = ()=>{
  const answers = {};
  const info = {};
  const bundleProperties = [{
    property:'appId',
    question:'App identifier',
    answer:v=>info.appId = answers['appId'] = v,
    prevAnswer:()=>info.appId
  },{
    property:'passphrase',
    question:'Passphrase for security',
    answer:v=>info.passphrase = answers['passphrase'] = v,
    prevAnswer:()=>info.passphrase
  },{
    property:'path-ios',
    question:'Path of ios bundle assets',
    answer:(v = IOS_BUNDLE_PATH)=>info.path.ios = answers['path-ios'] = v,
    prevAnswer:()=>info.path.ios,
    defaultValue:IOS_BUNDLE_PATH,
  },{
    property:'path-android',
    question:'Path of android bundle assets',
    answer:(v = ANDROID_BUNDLE_PATH)=>info.path.android = answers['path-android'] = v,
    prevAnswer:()=>info.path.android,
    defaultValue:ANDROID_BUNDLE_PATH
  },{
    property:'ota-server',
    question:'Address for ota-server',
    answer:v=>info[OTA_SERVER] = answers[OTA_SERVER] = v,
    prevAnswer:()=>info[OTA_SERVER]
  }];

  let maxPropertyLength = bundleProperties.reduce((p,{property:o})=>Math.max(p, o.length ),0) + 2;
  let maxQuestionLength = bundleProperties.reduce((p,{question:q})=>Math.max(p, q.length ),0) + 2;

  const initCore = ()=>{
    localPackage[LOCAL_PACKAGE_KEY] = Object.assign(info,{
      appId:'',
      passphrase:'',
      path:{
        ios:'',
        android:'',
      },
      [OTA_SERVER]:''
    }, localPackage[LOCAL_PACKAGE_KEY]);

    return bundleProperties.map(({question, answer, defaultValue })=>{
      return ()=>Q( question.lpad( maxQuestionLength ) + ( defaultValue ? ` (${defaultValue})` : '' )+ ' : ', null, null, defaultValue ).then(answer)
    } ).reduce((p,c)=>p.then(c), Promise.resolve() )
    .then(()=>{
      console.log( '- Check build property');
      console.log( '-----------------------------------' );
      console.log(
        bundleProperties.map(({property:p})=> p.lpad( maxPropertyLength ) + ' : ' + answers[p]).join('\n')
      )
      console.log( '-----------------------------------');
      return Q('Review bundle project information below. Is this correct? (' + 'y'.bold.underline + '/n)',['y','n'],true);
    })
    .then(answer=>{
      if( answer == null || answer.startsWith('y') ) return Promise.resolve();
      return initCore();
    })
    .catch(e=>{
      console.error( e );
    })
  }

  console.log( ' - ' + localPackage.name + ' bundle build preferences.\n' );

  initCore()
  .then(()=>saveJson( localPackage, 'package.json' ))
  .then(()=>{
    console.log( 'Init Done' );
    process.exit();
  });
}

const readLastOptions = ()=>{
  return readJson( 'bundle.local.config.json' )
  .then(lastOptions=>{
    if( lastOptions ) {
      console.log([
      '',
       'Last bundle build option was'.gray,
       '-'.repeat(40).gray ,
       'Platform : '.lpad(20).gray + lastOptions.os.bold.underline ,
       'Destination : '.lpad(20).gray + lastOptions.path.bold.underline ,
       'Development : '.lpad(20).gray + (lastOptions.isDev ? 'Dev' : 'Pro').bold.underline ,
       'Reset Cache : '.lpad(20).gray + (lastOptions.resetCache ? 'Yes' : 'No').bold.underline ,
       'Target Versions   '.lpad(20).gray ,
       '- iOS : '.lpad(20).gray + lastOptions.targetVersions.ios.bold.underline ,
       '- Android : '.lpad(20).gray + lastOptions.targetVersions.android.bold.underline,
       'Auto Upload : '.lpad(20).gray + (lastOptions.autoUpload ? 'Yes' : 'No').bold.underline ,
       '-'.repeat(40).gray,
       ''
     ].join('\n'));
    }
    return lastOptions || {}
  })
}

const build = ()=>{
  if( !bundleProperties || !bundleProperties.appId || !bundleProperties.passphrase || !bundleProperties.path || !bundleProperties.path.ios || !bundleProperties.path.android )
    BundleMakerError('Error : Can`t find bundle build properties. Please run `rn-ota init`.'.red.bold);

  const BundlePathForEachPlatform = {
    ios     : PATH + '/' + bundleProperties.path.ios,
    android : PATH + '/' + bundleProperties.path.android,
  };

  const upload= ( opts )=>{
    if( !bundleProperties.appId ) {
      console.log('appId'.bold.underline.red + 'is not defined at ' + './package.json'.bold.underline + ' ');
      return Promise.resolve();
    }
    return uploader(bundleProperties[OTA_SERVER], Object.assign({ source : opts.path + '/main.bundle', appId:bundleProperties.appId },opts) );
  }

  let opts = {
    os: null,
    path: null,
    isDev: false,
    targetVersions:{
      ios:'',
      android:'',
    },
    resetCache: true,
    upload: true
  }

  let _S = null, hasChange = false, bundleBuildTime = new Date();

  const getInfo = lastOptions=>{
    if( lastOptions ) opts = Object.assign(opts, lastOptions);
    if( typeof commands.recent !== 'undefined' ) return Promise.resolve();
    return Promise.resolve()
    .then(()=>{
      if( typeof commands.ios !== 'undefined' && typeof commands.android !== 'undefined' ) return 'all';
      if( typeof commands.ios !== 'undefined' ) return 'ios';
      if( typeof commands.android !== 'undefined' ) return 'android';
      return Q( ('Platform (' + SupportedOS.join(', ') + ', all)').rpad(30) + ' > ', ['ios', 'i','android','a','all'], !!lastOptions );
    }).then(os=>{
      if( os ) {
        opts.os = (os == 'i' || os == 'ios') ? 'ios' : (os == 'a' || os == 'android') ? 'android' : os;
        hasChange |= opts.os != lastOptions.os;
      }
      else console.log( '# Using recent setting'.lpad(30).gray + ' : ' + opts.os.white.bold );

      if( commands.path ) return commands.path
      return Q('Destination path'.rpad(30) + ' > ', null, !!lastOptions );
    }).then(path=>{
      if( path ) {
        hasChange |= opts.path != path;
        opts.path = path;
      }
      else console.log( '# Using recent setting'.lpad(30).gray + ' : ' + opts.path.white.bold );

      if( typeof commands.dev !== 'undefined' ) return commands.dev ? 'y' : 'n';
      return Q('Development flag (dev, pro)'.rpad(30) + ' > ', ['dev','pro','d','p'], !!lastOptions);
    }).then(isDev=>{
      if( isDev ) {
        opts.isDev = isDev.startsWith('d');
        hasChange |= opts.isDev != lastOptions.isDev;
      }
      else console.log( '# Using recent setting'.lpad(30).gray + ' : ' + (opts.isDev ? 'dev':'pro').white.bold );

      if( typeof commands.reset !== 'undefined' ) return commands.reset ? 'y' : 'n';
      return Q('Reset Cache (y/n)'.rpad(30) + ' > ', ['yes','y','no','n','nope'], !!lastOptions );
    }).then(resetCache=>{
      if( resetCache ) {
        opts.resetCache = resetCache.startsWith('y');
        hasChange |= opts.resetCache != lastOptions.resetCache;
      }
      else console.log( '# Using recent setting'.lpad(30).gray + ' : ' + (opts.resetCache ? 'yes' : 'no').white.bold );

      return SupportedOS.map(os=>{
        return opts.os == 'all' || opts.os == os ? ()=>{
          if( typeof commands[os] !== 'undefined' ) return opts.targetVersions[os] = commands[os];
          return Q(('Target Version[' + os + ']').rpad(30) + ' > ', null, !!opts.targetVersions[os] )
          .then(targetVersion=>{
            if( targetVersion ) {
              opts.targetVersions[os] = targetVersion.versionNormalize();
              hasChange |= opts.targetVersions[os] != (lastOptions.targetVersions || {})[os];
            }
            else console.log( '# Using recent setting'.lpad(30).gray + ' : ' + opts.targetVersions[os].white.bold );
          })
        } : null;
      }).filter(e=>e).reduce((p,q)=>p.then(q),Promise.resolve());
    })
    .then(()=>{
      if( typeof commands.upload !== 'undefined' ) return commands.upload ? 'y' : 'n';
      return ( opts.upload ) ? Q('Auto upload bundle (y/n)'.rpad(30) + ' > ', ['yes','y','no','n','nope'], true ) : 'n';
    }).then(answer=>{
      opts.autoUpload = !(answer && answer.startsWith('n'));
      hasChange |= opts.autoUpload != lastOptions.autoUpload;

      console.log( 'Check the bundle build configurations below.\n');
      bundleProperties.appId &&
      console.log(      'App ID'.lpad(20) + ' : ' + bundleProperties.appId.bold.underline );
      console.log(    'Platform'.lpad(20) + ' : ' + opts.os.bold.underline );
      console.log( 'Destination'.lpad(20) + ' : ' + opts.path.bold.underline );
      console.log( 'Development'.lpad(20) + ' : ' + (opts.isDev ? 'Yes' : 'No').bold.underline );
      console.log( 'Reset Cache'.lpad(20) + ' : ' + (opts.resetCache ? 'Yes' : 'No').bold.underline );
      // opts.targetVersion && console.log( ' Target Version : ' + (opts.targetVersion.toString()).bold.underline );

      opts.os != 'all' &&
      console.log( 'Target Version'.lpad(20) + ' : ' + opts.targetVersions[opts.os].bold.underline );
      opts.os == 'all' &&
      console.log( 'Target Versions'.lpad(20) + '\n' + SupportedOS.map(os=>os.lpad(20) + ' : ' + opts.targetVersions[os].bold.underline).join('\n').bold );

      if( opts.autoUpload ) console.log( 'Bundle will upload when packaging finished.'.gray );
      return Q('\nPreess any key, build bundle. Those configuration all correct? > ', ['y','n','yes','no'], true);
    }).then(a=>{
      commands = {};
      if( a == 'n' || a == 'no' ) {
        console.log( '\n'.repeat(5) );
        return getInfo( lastOptions );
      }
      return Object.keys(lastOptions).length == 0 ? 'y' : hasChange ?
        Q('Save setting ? (' + 'y'.underline + '/n)    > ', ['yes','y','no','n','nope'], true ) :'no'
    })
    .then(a=> (a == null || a == 'y' || a == 'yes') ? saveJson( opts, 'bundle.local.config.json' ) : null )
  }

  let bundleBuildTimeString = bundleBuildTime.format('yyyy-MM-dd HH:mm:ss');
  console.log( 'Bundle Build At : ' + bundleBuildTimeString.copyToClipboard().bold.underline );

  readLastOptions( 'bundle.local.config.json' )
  .then(getInfo)
  .then(()=> _S = Date.now() )
  .then(()=> (opts.os == 'all' ? SupportedOS : [opts.os]).map( os=>{
    return ()=>{
      let targetVersion = opts.targetVersions[os];
      let path = (opts.path + '/' + os + '/' + targetVersion).replace(/\/\//ig,'/');
      let _opts = Object.assign( {}, opts, {path, os, targetVersion} );
      let s = Date.now();
      
      console.log( '\n- bundleProperties.passphrase : ' + bundleProperties.passphrase);
      console.log( '\n- Make Bundle For ' + os.bold.underline );
      return runPackager( _opts )
      .then(()=> saveJson({ time:bundleBuildTime.getTime(), version:targetVersion }, _opts.path + '/bundle/bundle.info.json'))
      .then(()=> execPromise('cd ' + _opts.path + ';zip -P ' + bundleProperties.passphrase + ' -r ./main.bundle ./bundle/') )
      .then(()=>{
        let bundle = _opts.path + '/main.bundle', hash = _opts.hash = md5.sync( bundle );
        console.log( 'bundle: ' + hash.bold.underline + ' ' + (fs.statSync( bundle ).size / (1024 * 1024)).toFixed(2) + ' MB copied to ' + bundle );
        return execPromise('mkdir -p ' + BundlePathForEachPlatform[_opts.os] + ';cp ' + bundle + ' ' + BundlePathForEachPlatform[_opts.os] + '/main.bundle')
      })
      .then(()=> execPromise('rm -rf ' + _opts.path + '/bundle') )
      .then(()=> console.log('BUILD SUCCESSFUL'.green.bold +  ' in ' + ((Date.now() - s) / 1000).toFixed(2) + ' s'))
      .then(()=> opts.autoUpload && upload( _opts ) )
    }
  }).reduce((p,r)=>p.then(r),Promise.resolve() ) )
  .then(()=> console.log(new Date() + ' Elapse ' + ((Date.now() - _S) / 1000).toFixed(2) + ' s' ))
  .then(()=> say( Strings.buildComplete ) )
  .then(()=> process.exit( console.log( 'All is well. Bye bye'.bold ) ))
  .catch(e=> e && console.error( e ));
}

let title = 'react-native-ota-cli V' + builderPackage.version.versionNormalize();
console.log([
  ' '.repeat( title.length + 44 ),
  ' '.repeat(22) + title.white + ' '.repeat(22),
  ' '.repeat( title.length + 44 ),
].map(s=>s.bold.bgBlue).join('\n') + '\n');

if( commands.init ) {
  init();
}
else {
  build();
}
