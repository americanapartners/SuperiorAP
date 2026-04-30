import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Service role client — bypasses RLS. Only use for:
//   - auth.admin.inviteUserByEmail()
//   - auth.admin.updateUserById() (role changes)
//   - Storage uploads from the report export flow
// Never import this in client components or pages.
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
