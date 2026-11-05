export function passwordVersionClaims(user){
 if(!Number.isSafeInteger(user.password_version)||user.password_version<0)throw Error('PASSWORD_VERSION_REQUIRED');
 return {password_version:user.password_version};
}
export function validPasswordVersion(claims,user){
 const version=claims.password_version??0;
 return Number.isSafeInteger(version)&&version===user.password_version;
}
