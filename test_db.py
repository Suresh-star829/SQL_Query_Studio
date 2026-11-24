import json
import os
from dotenv import load_dotenv
import pyodbc

# Load variables from .env
load_dotenv()

# Parse the server config JSON
servers = json.loads(os.getenv("SQL_SERVERS_JSON"))
config = servers["LOCALDEV"]

# Build ODBC connection string for Windows Authentication
connection_string = (
    f"DRIVER={{{config['driver']}}};"
    f"SERVER={config['server']};"
    f"Encrypt={config['encrypt']};"
    f"TrustServerCertificate={config['trust_server_certificate']};"
    "Trusted_Connection=yes;"
)

try:
    print(f"Connecting to {config['label']}...")
    conn = pyodbc.connect(connection_string, timeout=5)
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION;")
    row = cursor.fetchone()
    print("Connection successful!\n")
    print("Database Version:")
    print(row[0])
    cursor.close()
    conn.close()
except pyodbc.Error as ex:
    sqlstate = ex.args[0]
    print(f"Connection failed: {sqlstate}")
    print(ex)