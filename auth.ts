import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const ALLOWED_DOMAINS = ["americanapartners.com", "nonzeroai.com"];

function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return ALLOWED_DOMAINS.includes(domain ?? "");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string ?? "").toLowerCase().trim();
        const password = credentials?.password as string;

        if (!email || !password) return null;
        if (!isAllowedDomain(email)) return null;

        // Temporary credentials until Supabase user table is wired up.
        // Set AUTH_ADMIN_PASSWORD in .env.local; all allowed-domain users
        // share this password for now.
        const adminPassword = process.env.AUTH_ADMIN_PASSWORD;
        if (!adminPassword || password !== adminPassword) return null;

        return {
          id: email,
          email,
          name: email.split("@")[0].replace(/\./g, " "),
        };
      },
    }),
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID ?? "",
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      // issuer scopes logins to a specific tenant; omit to allow any MS account.
      // Set MICROSOFT_TENANT_ID in .env to restrict to one Azure AD directory.
      ...(process.env.MICROSOFT_TENANT_ID && {
        issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0/`,
      }),
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Enforce domain restriction for all OAuth providers
      if (account?.provider !== "credentials") {
        if (!user.email || !isAllowedDomain(user.email)) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
});
