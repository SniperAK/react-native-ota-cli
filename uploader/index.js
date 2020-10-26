/**
module : bundle uploader

**/
const fs          = require('fs');
const request     = require('request');

const Spinner     = require('cli-spinner').Spinner;
const spinner     = new Spinner('Processing... %s    ');
const cliWidth    = require('cli-width');
const progressbar = require('cli-progress');

spinner.setSpinnerString( 18 );

module.exports = (uploadServer, { appId, targetVersion:appVersion, hash, os, source, isDev })=>{
  const bar = new progressbar.Bar({barsize:cliWidth() - 13}, {format: 'Uploading [{bar}]'});
  bar.start(100, 0);

  return new Promise( (resolve, reject)=>{
    let r = request.post(uploadServer,(err, res, body)=>{
      spinner.stop(true);
      if( err ) {
        console.log( 'receive error' );
        console.error( err );
        return reject( err );
      }
      else {
        return resolve( res, JSON.parse( body ) );
      }
    });

    let form = r.form();

    form.append('appId', appId);
    form.append('appVersion', appVersion);
    form.append('hash', hash);
    form.append('os', os);
    form.append('dev', isDev ? 'y' : 'n');
    form.append('bundle',fs.createReadStream(source));

    let uploadSize = 0;

    form.getLength((err, size)=>uploadSize = size);

    let timer = setInterval(()=>{
      let progress = Math.min(100, Math.round( r.req.connection._bytesDispatched / uploadSize * 100 ) );
      bar.update( progress );

      if( progress >= 100 ){
        clearInterval( timer );
        bar.stop();
        spinner.start();
      }
    }, 100);
  })
}
