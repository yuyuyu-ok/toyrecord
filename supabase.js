const SUPABASE_URL = 'YOUR_SUPABASE_URL';            // 替换为你的 Project URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // 替换为你的 anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
