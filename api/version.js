export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    version:'2.4-supabase-insert-only',
    liveProvider:'brave_search',
    llmEnabled:false
  });
}
