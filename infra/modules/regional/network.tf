locals {
  # 서울·도쿄 같은 이름 (ADR-030)
  name = "hotel-booking-aws-v2"
}

# ── 1. VPC: 지점 건물 전체. 주소 대역은 루트가 넘겨줌 ─────────────────
resource "aws_vpc" "this" {
  cidr_block = var.vpc_cidr
  tags       = { Name = local.name }
}

# ── 2. 서브넷: 층 3개(퍼블릭·앱·DB) × AZ 2개 ─────────────────────────
# cidrsubnet(대역, 더할 비트, 몇 번째) → /16 + 8 = /24, "몇 번째"가 셋째 자리 숫자
# 퍼블릭 0·1, 앱 10·11, DB 20·21
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

# ── 3. 출구: IGW(건물 정문) · EIP(공인 번호) · NAT(대리 발신) ─────────
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

# 설계는 AZ마다 NAT, 포트폴리오는 루트의 nat_count로 평소 1개 (ADR-034)
resource "aws_eip" "nat" {
  count  = var.nat_count
  domain = "vpc"
  tags   = { Name = "${local.name}-nat-${var.az_ids[count.index]}" }
}

resource "aws_nat_gateway" "this" {
  count         = var.nat_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id # 0번 = 첫 AZ, 1번 = 둘째 AZ
  tags          = { Name = "${local.name}-${var.az_ids[count.index]}" }

  # provider 문서 권장: IGW가 먼저 붙어 있어야 NAT가 인터넷으로 나감
  depends_on = [aws_internet_gateway.this]
}

# ── 4. 라우트 테이블: 층마다 "밖으로 가는 길" 안내판 1장 ────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public" }
}

# 앱 안내판은 AZ마다 1장: "밖으로는 우리 AZ의 NAT로"
resource "aws_route_table" "app" {
  count  = length(var.az_ids)
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    # min(내 AZ 번호, 마지막 NAT 번호): NAT가 1개면 두 AZ 모두 0번, 2개면 각자 자기 번호
    nat_gateway_id = aws_nat_gateway.this[min(count.index, var.nat_count - 1)].id
  }
  tags = { Name = "${local.name}-app-${var.az_ids[count.index]}" }
}

resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-db" }
}

# ── 5. 연결: 서브넷 ↔ 안내판. 서브넷은 안내판 1장, 안내판은 여러 서브넷이 같이 씀 ──
resource "aws_route_table_association" "public" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "app" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.app[count.index].id
  route_table_id = aws_route_table.app[count.index].id
}

resource "aws_route_table_association" "db" {
  count          = length(var.az_ids)
  subnet_id      = aws_subnet.db[count.index].id
  route_table_id = aws_route_table.db.id
}

# ── 6. S3 게이트웨이 엔드포인트: ECR 이미지 레이어(S3)를 NAT 대신 무료로 받는 샛길 (ADR-034) ──
# 게이트웨이형은 "라우트 테이블에 경로를 하나 꽂는" 방식이라 서브넷이 아니라 안내판에 연결함
data "aws_region" "current" {}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.app[*].id # 앱 안내판 전부 (컨테이너 이미지를 받는 건 앱 서브넷의 ECS)
  tags              = { Name = "${local.name}-s3" }
}
