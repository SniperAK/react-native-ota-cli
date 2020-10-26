#!/usr/bin/env node

Object.defineProperty(Array.prototype, 'limit',{
  value:function( start, count = -1 ){
    if( start < 0 ) start = this.length + start;
    if( count == -1 ) count = this.length - start;

    return this.map( (e,i)=> (i >= start && i < (start+count)) ?{e}: null ).filter( e=>e ).map(e=>e.e);
  },
  enumerable:false
} );

Object.defineProperty(Array.prototype,'replace',{
  value:function(start, count, replace){
    this.splice(start, count, replace);
    return this;
  }
});
console.log( .version );

const Commands = [
  {  name:'ios',     shortcut:'i', description:'Build iOS bundle with version.'},
  {  name:'android', shortcut:'a', description:'Build Android bundle.'},
  {  name:'upload',  shortcut:'u', description:'Upload bundle when build finished.'},
  {  name:'reset',   shortcut:'r', description:'Reset cache when bundle build.'},
  {  name:'path',    shortcut:'p', description:'Specify bundle build path.'},
  {  name:'dev',     shortcut:'d', description:'Set developement bundle.'},
  {  name:'help',    shortcut:'h', description:'Help'},
];

function help(){
  const max = Commands.reduce((p,c)=>Math.max(p,c.name.length),-1);
  console.log( '' )
  console.log( '  Usage: build-bundle [ios] [android] [options] \n')
  console.log( '  Options \n');
  console.log(
    Commands.map(c=>'      ' + c.shortcut + ', ' + c.name + ' '.repeat( max - c.name.length ) + ' : ' + c.description ).join('\n')
  );
  process.exit();
}

const commands = process.argv.limit(2)                            // cut arguments
  .map(a=>a.split(/:|=/ig))                                       // split key and value
  .map(([k,v])=>({c:k.replace(/-/ig,''), v:v || true}))           // normalize value
  .map(c=> ({
    c:Commands.find(({name:n,shortcut:s})=>n == c.c || s == c.c ),v:c.v
  }))
  .filter(c=>c.c)                                                 // filter default commands
  .reduce((p,{c,v})=>Object.assign(p,{[c.name]:v}),{});           // merge Object


if( commands.help ) help();

console.log( JSON.stringify({commands}, undefined, 4 ) );
