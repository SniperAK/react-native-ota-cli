
Object.defineProperty(Array.prototype,'replace',{
  value:function(start, count, replace){
    this.splice(start, count, replace);
    return this;
  }
});

Object.defineProperty(Array.prototype, 'limit',{
  value:function( start, count = -1 ){
    if( count == -1 ) count = this.length - start;
    return this.map( (e,i)=> (i >= start && i < (start+count)) ?{e}: null ).filter( e=>e ).map(e=>e.e);
  },
  enumerable:false
} );

Object.defineProperty(String.prototype, 'versionNormalize', {
  value:function(l=3, d=2){
    return ( '0'.repeat(d*l) + this.replace(/ /ig,'.').replace(/\.+/ig,'.')
      .split('.').filter( (e,i) => i < l ).reduce((p,c,i)=>p + Number( c )*Math.pow( Math.pow(10,d) ,l-1-i),0 )
    ).slice(-d*l).match(new RegExp('.{1,'+d+'}','g')).join('.');
  },
  enumerable:false,
});

Object.defineProperty(String.prototype, 'versionToNumber', {
  value:function(l=3, d=2) {
    return this.versionNormalize(l, d).split('.').splice(0,l).reduce((p,c,i)=>p+Number(c)*Math.pow( Math.pow(10,d) , l-1-i), 0);
  },
  enumerable:false,
});

Object.defineProperty(String.prototype,'lpad',{
  value:function(length, space = ' '){
    return space.repeat(length - this.length) + this;
  }
});

Object.defineProperty(Date.prototype,'format', {
  value:function(f = 'yyyy-MM-dd HH:mm:ss') {
    if (!this.valueOf()) return "";

    let d = this;

    return f.replace(/(yyyy|MM|dd|HH|mm|ss|z)/gi, ($1) =>{
      switch ($1) {
        case "yyyy": return d.getFullYear();
        case "MM": return (d.getMonth() + 1).zf(2);
        case "dd": return d.getDate().zf(2);
        case "HH": return d.getHours().zf(2);
        case "mm": return d.getMinutes().zf(2);
        case "ss": return d.getSeconds().zf(2);
        case "z":return (d.getTime()%1000).lzf(3);
        default: return $1;
      }
    })
  },
  enumerable:false
});

Object.defineProperty(String.prototype,'rpad',{
  value:function(length, space = ' '){
    return this + space.repeat(length - this.length);
  }
});

Object.defineProperty( String.prototype,'zf',{ value:function(len){
  return ( this.length > len ) ? this : "0".repeat(len - this.length) + this;
},enumerable:false});
Object.defineProperty( Number.prototype,'zf',{ value:function(len){
  return this.toString().zf(len);
},enumerable:false});

Object.defineProperty( String.prototype,'lzf',{ value:function(len){
  return ( this.length > len ) ? this : this + "0".repeat(len - this.length);
},enumerable:false});
Object.defineProperty( Number.prototype,'lzf',{ value:function(len){
  return this.toString().lzf(len);
},enumerable:false});

Object.defineProperty( String.prototype, 'copyToClipboard', { value:function(){
  var proc = require('child_process').spawn('pbcopy'); 
  proc.stdin.write(this.toString()); 
  proc.stdin.end();
  return this.toString();
},enumerable:false } );
