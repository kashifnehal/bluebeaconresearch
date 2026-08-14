terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = var.replication_group_id
  replication_group_description = "Redis for blue-beacon-research staging"
  engine                        = "redis"
  engine_version                = var.engine_version
  node_type                     = var.node_type
  number_cache_clusters         = var.number_cache_clusters
  automatic_failover_enabled    = var.automatic_failover_enabled
  parameter_group_name          = var.parameter_group_name

  subnet_group_name = aws_elasticache_subnet_group.redis_subnet.name

  tags = var.tags
}

resource "aws_elasticache_subnet_group" "redis_subnet" {
  name       = "bb-redis-subnet-${var.environment}"
  subnet_ids = var.subnet_ids
  description = "Subnet group for blue-beacon-research redis"
}
