# NRT AP Aging Dashboard

A modern web application for processing and managing AP (Accounts Payable) Aging Detail Reports for NRT Consulting. This dashboard replaces the n8n automation workflow with a fully integrated Next.js application.

## Features

- **File Upload Interface**: Upload multiple Excel (.xls, .xlsx) or CSV files
- **Automated Processing**: Parse and transform AP aging reports locally (no Google Sheets required)
- **Client Management**: Add, edit, remove, and reorder clients
- **Master Report Generation**: Combine multiple reports into a single formatted Excel file
- **Report History**: View and download previously generated reports
- **Email Delivery**: Send completed reports to recipients
- **Modern UI**: Built with shadcn/ui and Tailwind CSS

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **UI**: shadcn/ui + Tailwind CSS
- **Excel Processing**: ExcelJS
- **Deployment**: Vercel
- **Version Control**: GitHub

## Prerequisites

- Node.js 18+ and npm
- Supabase account
- Vercel account (for deployment)
- Git

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Non-Zero-AI/NRT_AP_AGING_DETAIL.git
cd NRT_AP_AGING_DETAIL/nrt-ap-aging-dashboard
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the schema from `supabase/schema.sql`
3. Get your project credentials from **Settings > API**:
   - Project URL
   - Anon/Public Key
   - Service Role Key (keep this secret!)

### 4. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Configuration (optional for now)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Initialize Database with Default Clients

Run this SQL in Supabase SQL Editor to populate the clients table:

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

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## Project Structure

```
nrt-ap-aging-dashboard/
├── app/
│   ├── api/              # API routes
│   │   ├── clients/      # Client CRUD operations
│   │   ├── reports/      # Report history
│   │   └── process-report/ # Main report processing
│   ├── clients/          # Clients page
│   ├── history/          # Report history page
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home (upload) page
├── components/
│   ├── ap-aging/         # File upload component
│   ├── clients/          # Clients table component
│   ├── history/          # Report history component
│   ├── layout/           # Sidebar and layout
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── constants/        # Default client list
│   ├── excel/            # Excel parsing and generation
│   ├── supabase/         # Supabase client configuration
│   ├── types/            # TypeScript types
│   └── utils.ts          # Utility functions
└── supabase/
    └── schema.sql        # Database schema
```

## Usage

### Upload and Process Reports

1. Navigate to **AP Aging Detail** (home page)
2. Click to upload one or more Excel/CSV files
3. Enter a report name (auto-populated with current date)
4. Enter recipient email address
5. Click **Generate Master Report**
6. Download or email the completed report

### Manage Clients

1. Navigate to **Clients** tab
2. Add new clients with **Add Client** button
3. Edit client names or display order
4. Delete clients as needed
5. Client order determines the order in the master report

### View History

1. Navigate to **History** tab
2. View all previously generated reports
3. Download completed reports
4. Check processing status

## Deployment to Vercel

### 1. Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **New Project**
3. Import your GitHub repository
4. Add environment variables from `.env.local`
5. Click **Deploy**

### 3. Configure Production Environment

After deployment, add the production URL to your Supabase project:
- Go to Supabase **Authentication > URL Configuration**
- Add your Vercel URL to allowed redirect URLs

## How It Works

The dashboard replaces the n8n workflow with local processing:

1. **File Upload**: Users upload Excel files through the web interface
2. **Parsing**: ExcelJS reads files and extracts transaction data
3. **Processing**: Data is transformed and aggregated by company
4. **Totals Calculation**: Sums are calculated per client in the master order
5. **Excel Generation**: A formatted master report is created in-memory
6. **Storage**: Report metadata is saved to Supabase
7. **Delivery**: Report can be downloaded or emailed

**No Google Sheets required!** All processing happens server-side in Next.js.

## Troubleshooting

### TypeScript Errors

The project may show some TypeScript errors related to Supabase types. These are cosmetic and won't affect functionality. To fix:

1. Generate types from your Supabase schema:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/supabase/database.types.ts
```

### Database Connection Issues

- Verify your Supabase credentials in `.env.local`
- Check that the schema has been applied
- Ensure Row Level Security policies are configured

## Contributing

This is a private project for NRT Consulting. For issues or feature requests, contact the development team.

## License

Proprietary - NRT Consulting
