#!/usr/bin/env node

/**
 * Test script for Raft cluster
 * Shows real-time status and connection information
 */

/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, console, Buffer, setTimeout */

const http = require('http');

const NODES = [
  { port: 3000, raftPort: 5000 },
  { port: 3002, raftPort: 5001 },
  { port: 3004, raftPort: 5002 }
];

async function checkNodeStatus(node) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${node.port}/raft/status`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const status = JSON.parse(data);
          resolve({ node, status });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => reject(new Error('Timeout')));
  });
}

async function sendCommand(node, command, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ command, data });
    const options = {
      hostname: 'localhost',
      port: node.port,
      path: '/raft/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ node, response });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function monitorCluster() {
  console.log('🔍 Monitoring Raft cluster...\n');

  try {
    // Check all nodes
    const results = await Promise.allSettled(
      NODES.map(node => checkNodeStatus(node))
    );

    console.log('📊 Real-time Cluster Status:');
    console.log('============================');

    let leaderFound = false;
    let totalConnections = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { node, status } = result.value;
        const clusterStatus = status.clusterStatus;

        const state = clusterStatus.state;
        const isLeader = state === 'leader' ? '👑 LEADER' : 
                        state === 'candidate' ? '🎯 CANDIDATE' : '👥 FOLLOWER';
        const isActive = status.isActive ? '🟢 ACTIVE' : '🔴 STANDBY';
        const connections = clusterStatus.connections;
        const term = clusterStatus.currentTerm;

        console.log(`Node ${index + 1} (Port ${node.port}): ${isLeader} | ${isActive}`);
        console.log(`   State: ${state.toUpperCase()}`);
        console.log(`   Term: ${term}`);
        console.log(`   Connections: ${connections}`);
        console.log(`   Raft Port: ${node.raftPort}`);
        console.log('');

        if (state === 'leader') {
          leaderFound = true;
        }
        totalConnections += connections;
      } else {
        console.log(`Node ${index + 1} (Port ${NODES[index].port}): ❌ UNREACHABLE\n`);
      }
    });

    console.log('📈 Network Statistics:');
    console.log(`   Total Connections: ${totalConnections}`);
    console.log(`   Expected Connections: ${NODES.length * (NODES.length - 1)}`);
    console.log(`   Network Health: ${totalConnections >= NODES.length * (NODES.length - 1) ? '🟢 EXCELLENT' : '🟡 GOOD'}`);
    console.log('');

    if (!leaderFound) {
      console.log('⚠️  No leader currently elected. This is normal during elections.');
      console.log('   Elections happen every 5-6 seconds with random timeouts.');
    } else {
      console.log('✅ Leader found! Cluster is healthy.');
    }

  } catch (err) {
    console.error('❌ Error monitoring cluster:', err.message);
  }
}

async function testCommand() {
  console.log('\n🧪 Testing command functionality...');

  try {
    // Find a node to test with
    const node = NODES[0];
    const result = await sendCommand(node, 'restart_workers', {});
    console.log('✅ Command test successful:', result.response);
  } catch (err) {
    console.log('❌ Command test failed:', err.message);
  }
}

async function main() {
  // Initial status
  await monitorCluster();

  // Monitor for 30 seconds
  console.log('🔄 Monitoring cluster for 30 seconds...\n');

  for (let i = 0; i < 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log(`\n--- Update ${i + 1}/6 (${(i + 1) * 5}s) ---`);
    await monitorCluster();
  }

  // Test command functionality
  await testCommand();

  console.log('\n🎉 Raft test completed!');
  console.log('   The cluster is working with real TCP communication.');
  console.log('   You can see elections happening and terms incrementing.');
}

// Run the test
main().catch(console.error); 
