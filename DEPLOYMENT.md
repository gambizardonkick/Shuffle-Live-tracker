# Deployment Guide: GitHub + Render

This guide will walk you through deploying your Shuffle.com Bet Tracker to GitHub and running it on Render.

## Part 1: Upload to GitHub

### Option A: Using Replit's Git Interface (Easiest)

1. **Add Git Tool to Replit**:
   - Click the **"+"** button in the Tools section
   - Search for "Git" and add it

2. **Connect to GitHub**:
   - In the Git pane, click **"Connect to GitHub"**
   - Authorize Replit to access your GitHub account
   - Select **"Create a new repository"** or choose an existing one

3. **Commit and Push**:
   - Review your changes in the Git pane
   - Check the files you want to commit
   - Write a commit message (e.g., "Initial commit")
   - Click **"Commit & Push"**

### Option B: Using Command Line

1. **In Replit Shell**, run these commands:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Shuffle.com Bet Tracker"

# Create repository on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/shuffle-bet-tracker.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note**: You may need to authenticate with GitHub. Use a [Personal Access Token](https://github.com/settings/tokens) as your password.

---

## Part 2: Deploy to Render

### Step 1: Sign Up for Render

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended)
3. Authorize Render to access your repositories

### Step 2: Create a New Web Service

1. Click **"New +"** in the top right
2. Select **"Web Service"**
3. Connect your GitHub repository:
   - Find "shuffle-bet-tracker" (or your repo name)
   - Click **"Connect"**

### Step 3: Configure the Service

Fill in these settings:

| Setting | Value |
|---------|-------|
| **Name** | `shuffle-bet-tracker` (or your choice) |
| **Region** | Choose closest to you |
| **Branch** | `main` |
| **Root Directory** | Leave blank |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server-scraper.js` |

### Step 4: Choose Instance Type

- **Free** - Good for testing (has limitations):
  - Spins down after 15 minutes of inactivity
  - 512 MB RAM
  - 0.1 CPU
  
- **Starter ($7/month)** - Recommended:
  - Always on
  - 512 MB RAM
  - 0.5 CPU

- **Standard ($25/month)** - For heavy use:
  - 2 GB RAM
  - 1 CPU

### Step 5: Add Environment Variables

Click **"Advanced"** and add environment variables:

| Key | Value | Notes |
|-----|-------|-------|
| `ADMIN_PASSWORD` | Your secure password | Change from default! |
| `DISCORD_WEBHOOK_URL` | Optional | Can configure per user later |

### Step 6: Deploy!

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repository
   - Run `npm install`
   - Start your server with `node server-scraper.js`

This takes 2-5 minutes. Watch the logs for progress.

### Step 7: Access Your App

Once deployed, you'll get a URL like:
```
https://shuffle-bet-tracker.onrender.com
```

Visit this URL to see your dashboard!

---

## Part 3: Fixing Puppeteer on Render

Puppeteer may need additional configuration on Render. If you see errors about Chrome not launching:

### Create render.yaml

Create a file called `render.yaml` in your project root:

```yaml
services:
  - type: web
    name: shuffle-bet-tracker
    env: node
    plan: free  # or starter, standard
    buildCommand: |
      npm install
      npx puppeteer browsers install chrome
    startCommand: node server-scraper.js
    envVars:
      - key: PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
        value: false
      - key: PUPPETEER_EXECUTABLE_PATH
        value: /opt/render/.cache/puppeteer/chrome/linux-*/chrome-linux*/chrome
```

Commit and push this file to GitHub:

```bash
git add render.yaml
git commit -m "Add Render configuration"
git push
```

Render will automatically redeploy with the new configuration.

---

## Part 4: Using Your Deployed App

### Admin Panel Setup

1. Visit `https://your-app.onrender.com`
2. Click **"⚙️ Admin Panel"**
3. Enter your admin password
4. Add users to track:
   - Username: e.g., "TheGoobr"
   - Discord Webhook: `https://discord.com/api/webhooks/...`
   - Click "Add User"

### Get Discord Webhook URLs

1. Open Discord
2. Go to Server Settings → Integrations
3. Click **"Webhooks"** → **"New Webhook"**
4. Choose a channel
5. Click **"Copy Webhook URL"**
6. Paste into admin panel

### Monitor Your App

View logs in Render:
1. Go to your service dashboard
2. Click **"Logs"** tab
3. Watch real-time scraping activity

---

## Troubleshooting

### App Spins Down (Free Tier)

Free tier sleeps after 15 minutes. Solutions:
- Upgrade to Starter plan ($7/month)
- Use external ping service like [UptimeRobot](https://uptimerobot.com)

### Puppeteer Crashes

If you see "Failed to launch browser":
1. Add `render.yaml` (see Part 3)
2. Check memory usage - upgrade if needed
3. Review logs for specific errors

### Discord Webhooks Not Working

- Verify URL starts with `https://discord.com/api/webhooks/`
- Check webhook permissions in Discord
- Make sure channel still exists

### Can't Access Admin Panel

- Verify `ADMIN_PASSWORD` environment variable is set
- Try default password: "admin123"
- Check browser console for errors

---

## Updating Your App

When you make changes:

1. **Commit to GitHub**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push
   ```

2. **Render Auto-Deploys**:
   - Render detects the push
   - Automatically rebuilds and redeploys
   - Takes 2-3 minutes

You can also manually deploy:
- Go to Render dashboard
- Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## Cost Breakdown

### Render Pricing

- **Free**: $0/month (with limitations)
- **Starter**: $7/month (recommended)
- **Standard**: $25/month (for high traffic)

### What You Need

Minimum:
- **Free tier** for testing
- **Starter tier** for always-on production

---

## Next Steps

1. ✅ Push code to GitHub
2. ✅ Deploy to Render
3. ✅ Set up admin password
4. ✅ Add tracked users with webhooks
5. ✅ Monitor the dashboard!

Your bet tracker is now live 24/7! 🚀

---

## Support

- **Render Docs**: https://render.com/docs
- **GitHub Issues**: Create an issue in your repository
- **Discord**: Get a webhook URL for notifications
