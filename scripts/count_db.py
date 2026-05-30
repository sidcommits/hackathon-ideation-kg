from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

# Load env variables from .env file
load_dotenv()

uri = os.getenv("NEO4J_URI", "neo4j+s://e3874057.databases.neo4j.io")
user = os.getenv("NEO4J_USER", "e3874057")
password = os.getenv("NEO4J_PASSWORD", "pu9CcRO8ipPCH3N_IbjS7nQfr_QPOhKNFebK2kWQ_08")

print(f"Connecting to Neo4j database at {uri}...")
try:
    driver = GraphDatabase.driver(uri, auth=(user, password))
    with driver.session() as session:
        # Count total nodes
        nodes_result = session.run("MATCH (n) RETURN count(n) AS node_count")
        node_count = nodes_result.single()["node_count"]
        
        # Count total relationships/edges
        edges_result = session.run("MATCH ()-[r]->() RETURN count(r) AS edge_count")
        edge_count = edges_result.single()["edge_count"]
        
        # Count nodes by labels
        labels_result = session.run("MATCH (n) RETURN labels(n) AS labels, count(n) AS count")
        labels_count = {}
        for record in labels_result:
            lbls = record["labels"]
            count = record["count"]
            lbl_str = ", ".join(lbls) if lbls else "No Label"
            labels_count[lbl_str] = labels_count.get(lbl_str, 0) + count
            
        print("\n=== DATABASE COUNTS ===")
        print(f"Total Nodes: {node_count}")
        print(f"Total Edges/Relationships: {edge_count}")
        print("\nNodes by Label:")
        for label, count in labels_count.items():
            print(f" * {label}: {count}")
            
except Exception as e:
    print(f"Failed to connect to Neo4j: {e}")
