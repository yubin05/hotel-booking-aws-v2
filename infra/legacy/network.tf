# VPC
resource "aws_vpc" "legacy_vpc_1" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = {
    "Name" = "legacy_vpc_1"
  }
}

# Subnets
# Public
resource "aws_subnet" "legacy_public_subnet_1" {
  vpc_id                  = aws_vpc.legacy_vpc_1.id
  cidr_block              = var.subnet_cidr_1
  availability_zone       = local.availability_zone
  map_public_ip_on_launch = true
  tags = {
    "Name" = "legacy_public_subnet_1"
  }
}
# Private
resource "aws_subnet" "legacy_private_subnet_1" {
  vpc_id            = aws_vpc.legacy_vpc_1.id
  cidr_block        = var.subnet_cidr_2
  availability_zone = local.availability_zone
  tags = {
    "Name" = "legacy_private_subnet_1"
  }
}

# 인터넷 게이트웨이
resource "aws_internet_gateway" "legacy_igw_1" {
  vpc_id = aws_vpc.legacy_vpc_1.id
  tags = {
    "Name" = "legacy_igw_1"
  }
}

# 라우팅 테이블 - public
resource "aws_route_table" "legacy_public_rt_1" {
  vpc_id = aws_vpc.legacy_vpc_1.id
  tags = {
    "Name" = "legacy_public_rt_1"
  }
}
resource "aws_route_table_association" "legacy_public_sn_rt_association" {
  route_table_id = aws_route_table.legacy_public_rt_1.id
  subnet_id      = aws_subnet.legacy_public_subnet_1.id
}
resource "aws_route" "legacy_public_rt1_route1" {
  route_table_id         = aws_route_table.legacy_public_rt_1.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.legacy_igw_1.id
}
# 라우팅 테이블 - private
resource "aws_route_table" "legacy_private_rt_1" {
  vpc_id = aws_vpc.legacy_vpc_1.id
  tags = {
    "Name" = "legacy_private_rt_1"
  }
}
resource "aws_route_table_association" "legacy_private_sn_rt_association" {
  route_table_id = aws_route_table.legacy_private_rt_1.id
  subnet_id      = aws_subnet.legacy_private_subnet_1.id
}
resource "aws_route" "legacy_private_rt1_route1" {
  route_table_id         = aws_route_table.legacy_private_rt_1.id
  destination_cidr_block = "0.0.0.0/0"
  network_interface_id   = aws_instance.nat_instance_1.primary_network_interface_id
}