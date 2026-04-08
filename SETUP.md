# NRT AP Aging Dashboard - Setup Guide

## Quick Start Checklist

- [ ] Create Supabase project
- [ ] Run database schema
- [ ] Configure environment variables
- [ ] Initialize clients data
- [ ] Test locally
- [ ] Deploy to Vercel
- [ ] Configure production environment

## Detailed Setup Steps

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose your organization
4. Enter project details:
   - **Name**: `nrt-ap-aging-dashboard`
   - **Database Password**: (generate a strong password and save it)
   - **Region**: Choose closest to your users
5. Click **Create new project** and wait for provisioning

### 2. Set Up Database

1. In your Supabase project, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste into the SQL editor
5. Click **Run** to execute
6. Verify tables were created in **Table Editor**

### 3. Initialize Client Data

1. Still in **SQL Editor**, create a new query
2. Copy and paste this SQL:

```sql
INSERT INTO clients (name, display_order) VALUES
  ('Dobson', 1),
  ('Creekside Apartments', 2),
  ('Pilot Mountain', 3),
  ('King', 4),
  ('Elkin', 5),
  ('East Bend', 6),
  ('JMS Brunswick', 7),
  ('JMS HOLLY SPRINGS LLC', 8),
  ('JMS Holly Springs LLC', 9),
  ('JMS Jensen Beach', 10),
  ('JMS Mooresville', 11),
  ('JMS Mooresville 2', 12),
  ('JMS Mooresville 3', 13),
  ('JMS Rural Hall', 14),
  ('JMS SALISBURY', 15),
  ('JMS Salisbury', 16),
  ('Canton', 17),
  ('NWA', 18),
  ('CJ Trust', 19),
  ('Hartland', 20),
  ('Kenosha', 21),
  ('Lakeland', 22),
  ('Madison', 23),
  ('1912 Walton', 24),
  ('8th Street', 25),
  ('Airport Blvd', 26),
  ('Broyles Street', 27),
  ('Centerton', 28),
  ('Joyce', 29),
  ('Oak Street', 30),
  ('Pleasant Street 1', 31),
  ('Pleasant Street 2', 32),
  ('Robinson', 33),
  ('Shady Grove', 34),
  ('Trafalgar', 35),
  ('Walton', 36),
  ('Fond du Lac', 37),
  ('Fond du Lac Business Savings', 38),
  ('Lakeside Truck Rentals', 39);
```

3. Click **Run**
4. Verify in **Table Editor** > **clients** that 39 rows were inserted

### 4. Get API Credentials

1. Go to **Settings** > **API**
2. Copy these values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public** key (under Project API keys)
   - **service_role** key (under Project API keys - keep this secret!)

### 5. Configure Local Environment

1. In your project root, copy the example env file:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` with your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```

3. Save the file

### 6. Test Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000)

4. Test the application:
   - Navigate to **Clients** tab - you should see 39 clients
   - Try adding a test client
   - Navigate to **AP Aging Detail** - upload interface should load
   - Navigate to **History** - should show empty state

### 7. Deploy to Vercel

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit - NRT AP Aging Dashboard"
   git push origin main
   ```

2. Go to [vercel.com](https://vercel.com) and sign in

3. Click **Add New** > **Project**

4. Import your GitHub repository: `Non-Zero-AI/NRT_AP_AGING_DETAIL`

5. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `nrt-ap-aging-dashboard`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)

6. Add environment variables (click **Environment Variables**):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   ```

7. Click **Deploy**

8. Wait for deployment to complete (~2-3 minutes)

### 8. Configure Production URL in Supabase

1. Copy your Vercel deployment URL (e.g., `https://nrt-ap-aging.vercel.app`)

2. In Supabase, go to **Authentication** > **URL Configuration**

3. Add your Vercel URL to:
   - **Site URL**: `https://nrt-ap-aging.vercel.app`
   - **Redirect URLs**: `https://nrt-ap-aging.vercel.app/**`

4. Click **Save**

### 9. Test Production Deployment

1. Visit your Vercel URL
2. Test all three pages:
   - AP Aging Detail (upload)
   - Clients (should show your client list)
   - History (should show empty state)
3. Try uploading a test file

## Next Steps

### Optional: Configure Custom Domain

1. In Vercel, go to your project **Settings** > **Domains**
2. Add your custom domain (e.g., `ap-aging.nrtconsulting.com`)
3. Follow Vercel's DNS configuration instructions
4. Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables
5. Update Supabase URL configuration with new domain

### Optional: Email Configuration

To enable email delivery of reports:

1. Get SMTP credentials (Gmail App Password recommended)
2. Add to Vercel environment variables:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-app-password
   ```
3. Implement email sending in `/app/api/send-email/route.ts`

## Troubleshooting

### "Failed to fetch clients" error

- Check Supabase credentials in `.env.local`
- Verify database schema was applied
- Check Supabase project is active (not paused)
- Verify RLS policies are configured correctly

### TypeScript errors in IDE

- These are cosmetic and won't affect functionality
- Generate proper types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/database.types.ts`

### Upload not working

- Check file size limits (default 50MB in Next.js)
- Verify Excel files are valid .xls or .xlsx format
- Check browser console for errors

### Deployment fails on Vercel

- Verify all environment variables are set
- Check build logs for specific errors
- Ensure `package.json` has correct build script

## Support

For issues or questions, contact the development team or refer to:
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)
