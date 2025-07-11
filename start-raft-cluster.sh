#!/bin/bash

# Start Raft cluster for rapid-relayer
# This script starts 3 instances with real TCP communication

echo "🚀 Starting Raft cluster for rapid-relayer..."

# Create config files for each node
create_config() {
    local node_id=$1
    local port=$2
    local metric_port=$3
    local raft_port=$4
    
    cat > "config.${node_id}.json" << EOF
{
  "port": ${port},
  "metricPort": ${metric_port},
  "logLevel": "info",
  "dbPath": "./data/${node_id}",
  "raft": {
    "enabled": true,
    "nodeId": "${node_id}",
    "host": "localhost",
    "port": ${raft_port},
    "peers": [
      {"id": "node-1", "host": "localhost", "port": 5000},
      {"id": "node-2", "host": "localhost", "port": 5001},
      {"id": "node-3", "host": "localhost", "port": 5002}
    ],
    "electionTimeout": 10000,
    "heartbeatInterval": 1000
  },
  "chains": [
    {
          "bech32Prefix": "init",
          "chainId": "initiation-2",
          "gasPrice": "0.15uinit",
          "restUri": "https://rest.testnet.initia.xyz/",
          "rpcUri": "https://rpc.testnet.initia.xyz/",
          "wallets": [
            {
              "key": {
                "type": "raw",
                "privateKey": "1fd578349a88ed7815266b21933878359259a750003ba4dc9a5a20b7be435fa1"
              },
              "maxHandlePacket": 30
            }
          ]
        },
        {
          "bech32Prefix": "init",
          "chainId": "minimove-2",
          "gasPrice": "0gas",
          "restUri": "https://rest.minimove-2.initia.xyz",
          "rpcUri": "https://rpc.minimove-2.initia.xyz",
          "wallets": [
            {
              "key": {
                "type": "raw",
                "privateKey": "1fd578349a88ed7815266b21933878359259a750003ba4dc9a5a20b7be435fa1"
              },
              "maxHandlePacket": 30
            }
          ]
        }
  ]
}
EOF
}

# Create config files
echo "📝 Creating configuration files..."
create_config "node-1" 3000 3001 5000
create_config "node-2" 3002 3003 5001
create_config "node-3" 3004 3005 5002

# Create data directories
mkdir -p data/node-1 data/node-2 data/node-3

# Function to start a node
start_node() {
    local node_id=$1
    local config_file="config.${node_id}.json"
    
    echo "🔄 Starting ${node_id}..."
    CONFIGFILE="${config_file}" npm start &
    local pid=$!
    echo $pid > "pid.${node_id}"
    echo "✅ ${node_id} started with PID $pid"
}

# Start all nodes
echo "🔄 Starting nodes..."
start_node "node-1"
sleep 3
start_node "node-2"
sleep 3
start_node "node-3"

echo ""
echo "🎉 Raft cluster started!"
echo ""
echo "📊 Node Status:"
echo "  Node 1: http://localhost:3000/raft/status (Raft: localhost:5000)"
echo "  Node 2: http://localhost:3002/raft/status (Raft: localhost:5001)"
echo "  Node 3: http://localhost:3004/raft/status (Raft: localhost:5002)"
echo ""
echo "🧪 Test the cluster:"
echo "  ./test-raft-cluster.js"
echo ""
echo "🛑 To stop the cluster:"
echo "  ./stop-raft-cluster.sh"
echo ""

# Wait for user input
read -p "Press Enter to stop the cluster..."

# Stop all nodes
echo "🛑 Stopping cluster..."
for node in node-1 node-2 node-3; do
    if [ -f "pid.${node}" ]; then
        pid=$(cat "pid.${node}")
        kill $pid 2>/dev/null
        rm "pid.${node}"
        echo "✅ Stopped ${node}"
    fi
done

# Clean up config files
rm -f config.node-*.json

echo "🎉 Cluster stopped!" 