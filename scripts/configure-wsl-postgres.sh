#!/usr/bin/env bash
set -e

CONF=$(ls /etc/postgresql/*/*/postgresql.conf | head -n 1)
HBA=$(ls /etc/postgresql/*/*/pg_hba.conf | head -n 1)

echo "PostgreSQL config: $CONF"
echo "PostgreSQL HBA: $HBA"

# Enable listen on all addresses
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$CONF"
sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "$CONF"

# Allow all IPv4 connections
if ! grep -q "0.0.0.0/0 md5" "$HBA"; then
    echo "host all all 0.0.0.0/0 md5" >> "$HBA"
    echo "host all all 0.0.0.0/0 scram-sha-256" >> "$HBA"
fi

# Restart PostgreSQL service
systemctl restart postgresql@18-main || systemctl restart postgresql

# Set password for postgres user
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'password';\""

echo "PostgreSQL configured successfully."
