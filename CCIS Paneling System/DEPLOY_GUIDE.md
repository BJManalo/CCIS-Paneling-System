# How to Host Your Project and Enable Auto-Updates

This guide explains how to put your project online so anyone can view it, and how to set it up so that your local edits automatically update the website.

## Prerequisites

Since your computer currently does not have `git` available in the terminal, you will need to install it to enable the "auto-update" feature.

1.  **Download Git**: Go to [git-scm.com/download/win](https://git-scm.com/download/win) and download the "64-bit Git for Windows Setup".
2.  **Install**: Run the installer and click "Next" through the default options.
3.  **Restart**: After installing, **close and reopen** your code editor/terminal to recognize the new command.

---

## Option 1: Quick Start (Manual Upload)
*Best for testing right now if you don't want to install Git yet.*

1.  Go to [Netlify Drop](https://app.netlify.com/drop).
2.  Drag and drop your entire project folder (`CCIS Paneling System`) into the box on the screen.
3.  Netlify will upload your site and give you a live URL (e.g., `https://random-name.netlify.app`).
4.  **Note**: This will NOT auto-update. To change the site, you must drag and drop the folder again every time you make edits.

---

## Option 2: Professional Setup (Auto-Updates)
*This is what you asked for: edits here will automatically update the website.*

### Step 1: Create a GitHub Repository
1.  Go to [github.com](https://github.com/) and sign up/log in.
2.  Click the **+** icon in the top right -> **New repository**.
3.  Name it (e.g., `ccis-paneling-system`).
4.  Select **Public**.
5.  Click **Create repository**.

### Step 2: Push Your Code to GitHub
*After installing Git (from Prerequisites), run these commands in your project terminal:*

```powershell
# Initialize Git in your project
git init

# Add all files to the "staging area"
git add .

# Save your changes locally
git commit -m "Initial launch of CCIS Paneling System"

# Connect to your GitHub repository (Replace URL with your actual repo URL)
git remote add origin https://github.com/YOUR_USERNAME/ccis-paneling-system.git

# Send your code to GitHub
git branch -M main
git push -u origin main
```

### Step 3: Connect to a Hosting Provider
We recommend **Netlify** or **Vercel** for the best experience.

**Using Netlify:**
1.  Log in to [Netlify](https://www.netlify.com/).
2.  Click **"Add new site"** -> **"Import from existing project"**.
3.  Choose **GitHub**.
4.  Authorize Netlify to access your GitHub account.
5.  Select your `ccis-paneling-system` repository.
6.  Click **Deploy**.

### Step 4: Verification
*   Netlify/Vercel will give you a public URL (e.g., `ccis-system.netlify.app`).
*   **To Update:**
    1.  Make changes in your code editor.
    2.  Run these commands:
        ```powershell
        git add .
        git commit -m "Description of changes"
        git push
        ```
    3.  Watch your website update automatically within seconds!
