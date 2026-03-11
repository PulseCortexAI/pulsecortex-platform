const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

// HMAC authentication for GitHub webhook
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');

function verifySignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  const payload = JSON.stringify(req.body);
  
  if (!signature) {
    console.log('Webhook: Missing signature');
    return res.status(401).json({ error: 'Missing signature' });
  }
  
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(payload);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;
  
  // Use timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    console.log('Webhook: Invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  next();
}

// GitHub webhook endpoint
router.post('/webhook', verifySignature, (req, res) => {
  const { ref, sha, repository, action, sender } = req.body;
  
  // Log webhook details
  console.log(`Webhook: ${repository?.full_name || 'unknown'}@${sha?.substring(0, 7) || 'unknown'} by ${sender?.login || 'unknown'}`);
  
  // Validate required fields
  if (!ref || !sha) {
    return res.status(400).json({ error: 'Missing ref or sha' });
  }
  
  // Only deploy from main branch pushes (not PRs, issues, etc)
  if (ref !== 'refs/heads/main') {
    return res.status(200).json({ 
      message: 'Ignoring non-main branch', 
      ref,
      action: action || 'push'
    });
  }
  
  // Run deployment asynchronously
  const deployScript = path.join(__dirname, '..', '..', 'deploy.sh');
  const logFile = '/tmp/deploy-webhook.log';
  
  // Respond immediately
  res.json({ 
    success: true, 
    message: 'Deployment triggered',
    sha: sha.substring(0, 7),
    timestamp: new Date().toISOString()
  });
  
  // Execute deployment in background
  exec(`cd ${path.dirname(deployScript)} && bash deploy.sh > ${logFile} 2>&1`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Deployment failed: ${error.message}`);
      // Could notify via Slack/email here
      return;
    }
    
    console.log(`Deployment successful: ${stdout}`);
    
    // Append success to log
    fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] Deployment completed successfully\n`);
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'deploy-webhook',
    timestamp: new Date().toISOString(),
    endpoint: '/api/deploy/webhook'
  });
});

module.exports = router;
module.exports.WEBHOOK_SECRET = WEBHOOK_SECRET;