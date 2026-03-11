import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ybiuzhkcxltxbgnlztjl.supabase.co'
const supabaseKey = 'sb_publishable_tsDbyOuN6wCzCivJf5sK1w_1Sgmf-Ue'

export const supabase = createClient(supabaseUrl, supabaseKey)