export function gmailFailure(status,payload,isJson=true,project='65416227927'){
 const e=payload?.error||{};const codes=[...(Array.isArray(e.errors)?e.errors.map(x=>x?.reason):[]),...(Array.isArray(e.details)?e.details.map(x=>x?.reason):[]),e.status].filter(x=>typeof x==='string');const reason=codes.find(x=>['accessNotConfigured','SERVICE_DISABLED','insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT','domainPolicy','DOMAIN_POLICY','userRateLimitExceeded','rateLimitExceeded','dailyLimitExceeded'].includes(x))||codes[0]||'';
 const clean=typeof e.message==='string'?e.message.replace(/Bearer\s+\S+|ya29\.[^\s"<>]+/gi,'[פרט מוסתר]').slice(0,700):'';
 let kind='unknown',message='בקשת Gmail נכשלה ('+status+').';let enableUrl='';
 if(status===401){kind='expired';message='תוקף החיבור ל־Gmail פג. יש להתחבר מחדש.';}
 else if(codes.some(x=>['accessNotConfigured','SERVICE_DISABLED'].includes(x))){kind='disabled';message='Gmail API אינו פעיל בפרויקט Google של האתר. יש להפעיל אותו ואז לנסות שוב.';if(/^\d+$/.test(project))enableUrl='https://console.cloud.google.com/apis/library/gmail.googleapis.com?project='+project;}
 else if(codes.some(x=>['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'].includes(x))){kind='scope';message='Google לא אישר את הרשאת הקריאה הנדרשת. לחץ על חיבור מחדש ואשר קריאת הודעות.';}
 else if(codes.some(x=>['domainPolicy','DOMAIN_POLICY'].includes(x))){kind='policy';message='מדיניות חשבון Google של הארגון חוסמת את הגישה ל־Gmail. נדרש אישור ממנהל הארגון.';}
 else if(codes.some(x=>['userRateLimitExceeded','rateLimitExceeded','dailyLimitExceeded','RESOURCE_EXHAUSTED'].includes(x))||status===429){kind='quota';message='Google הגביל זמנית את מספר הבקשות. המתן לפני ניסיון נוסף.';}
 else if(!isJson){kind='network';message='בקשת Gmail נחסמה ('+status+'), ולא התקבלה תשובת שגיאה תקינה של Google. בדוק אם מוצגת חסימת רשת או סינון.';}
 else if(status===403)message='Google דחה את הגישה ל־Gmail (403). הסיבה שהוחזרה מופיעה כאן למטה.';
 return {kind,status,reason,message,detail:clean,enableUrl};
}
