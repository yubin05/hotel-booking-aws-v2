locals {
  # 서울·도쿄 같은 이름 (ADR-030)
  name = "hotel-booking-aws-v2"
}

resource "aws_vpc" "this" {
  cidr_block = var.vpc_cidr
  tags       = { Name = local.name }
}

# 서브넷은 /24 (VPC /16에서 8비트 더). 셋째 자리로 계층 구분: 퍼블릭 0~, 앱 10~, DB 20~
resource "aws_subnet" "public" {
  count                = length(var.az_ids)
  vpc_id               = aws_vpc.this.id
  cidr_block           = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone_id = var.az_ids[count.index]
  tags                 = { Name = "${local.name}-public-${var.az_ids[count.index]}" }
}

resource "aws_subnet" "app" {
  count                = length(var.az_ids)
  vpc_id               = aws_vpc.this.id
  cidr_block           = cidrsubnet(var.vpc_cidr, 8, 10 + count.index)
  availability_zone_id = var.az_ids[count.index]
  tags                 = { Name = "${local.name}-app-${var.az_ids[count.index]}" }
}

resource "aws_subnet" "db" {
  count                = length(var.az_ids)
  vpc_id               = aws_vpc.this.id
  cidr_block           = cidrsubnet(var.vpc_cidr, 8, 20 + count.index)
  availability_zone_id = var.az_ids[count.index]
  tags                 = { Name = "${local.name}-db-${var.az_ids[count.index]}" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat" }
}

# 비용 때문에 1개, 첫 AZ의 퍼블릭 서브넷에 (02-architecture)
resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = local.name }

  # provider 문서 권장: IGW가 먼저 붙어 있어야 NAT가 인터넷으로 나감
  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table" "app" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = { Name = "${local.name}-app" }
}

# DB는 밖으로 나갈 일이 없어 경로 없음 (VPC 내부 local 경로만)
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-db" }
}

resource "aws_route_table_association" "public" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "app" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app.id
}

resource "aws_route_table_association" "db" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}
