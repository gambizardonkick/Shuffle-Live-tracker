# Deployment Guide

## Prerequisites
- A GitHub account
- A Render account (sign up at https://render.com)

## Part 1: Push to GitHub

### Step 1: Initialize Git Repository (if not already done)
The repository is already initialized. You can verify by running:
```bash
git status
```

### Step 2: Add Your Files to Git
```bash
git add .
git status
```

### Step 3: Commit Your Changes
```bash
git commit -m "Initial commit - Shuffle bet tracker"
```

### Step 4: Create a GitHub Repository
1. Go to https://github.com
2. Click the "+" icon in top right → "New repository"
3. Name it: `shuffle-bet-tracker` (or any name you prefer)
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Step 5: Connect and Push to GitHub
GitHub will show you commands. Use these:
```bash
git remote add origin https://github.com/YOUR_USERNAME/shuffle-bet-tracker.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## Part 2: Deploy to Render

### Step 1: Sign Up/Login to Render
1. Go to https://render.com
2. Sign up or login (you can use your GitHub account)

### Step 2: Connect Your GitHub Repository
1. From Render dashboard, click "New +" → "Web Service"
2. Click "Connect a repository" → "Configure account"
3. Give Render access to your GitHub repository
4. Select the `shuffle-bet-tracker` repository

### Step 3: Configure Your Web Service
Fill in the following settings:

**Basic Settings:**
- **Name**: `shuffle-bet-tracker` (or any name you prefer)
- **Region**: Choose closest to your location
- **Branch**: `main`
- **Root Directory**: Leave blank
- **Runtime**: `Node`

**Build Settings:**
- **Build Command**: `npm install`
- **Start Command**: `npm start`

**Instance Type:**
- **Free** (or choose paid plan for better performance)

### Step 4: Add Environment Variables
Click "Advanced" → "Add Environment Variable" and add:

1. **DISCORD_WEBHOOK_URL**
   - Value: Your Discord webhook URL
   
2. **ADMIN_PASSWORD**
   - Value: `GZ-HUA-12D-19` (or change to your preferred password)

3. **PORT**
   - Value: `5000`

### Step 5: Deploy
1. Click "Create Web Service"
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Start your server
3. Wait 3-5 minutes for first deployment

### Step 6: Get Your Live URL
Once deployed, Render will give you a URL like:
```
https://shuffle-bet-tracker.onrender.com
```

This is your live website URL!

---

## Important Notes for Render Deployment

### Free Tier Limitations
- Server spins down after 15 minutes of inactivity
- Takes 30-60 seconds to wake up on first request
- Enough for testing/personal use

### Upgrade for Production
For production use, consider:
- Paid plan ($7/month) for always-on service
- No sleep/wake delays
- Better performance

### Chromium/Puppeteer on Render
✅ **Automatically handled!** The project is configured to:
- Download Chromium automatically during `npm install` (via postinstall script)
- Detect if running on Replit or Render and use the correct Chrome path
- No manual configuration needed!

**How it works:**
- On Replit: Uses Replit's built-in Chromium
- On Render: Puppeteer downloads and installs its own Chromium (~170MB)
- First deployment takes a bit longer due to Chromium download

### Monitor Your Deployment
- Check logs in Render dashboard
- Set up Discord notifications for errors
- Monitor uptime and performance

---

## Updating Your Deployment

When you make changes:

1. **Commit changes locally:**
```bash
git add .
git commit -m "Description of changes"
```

2. **Push to GitHub:**
```bash
git push origin main
```

3. **Render auto-deploys:**
   - Render automatically detects the push
   - Rebuilds and redeploys your service
   - No manual intervention needed!

---

## Troubleshooting

### Deployment fails
- Check Render logs for errors
- Verify all environment variables are set
- Ensure `node_modules` is in `.gitignore`

### Scraper not working
- Chromium might not be installed
- Check Puppeteer executable path
- Review scraper logs

### 502 Bad Gateway
- Server is starting up (wait 30 seconds)
- Or crashed (check logs)

### Need help?
Check Render documentation: https://render.com/docs
