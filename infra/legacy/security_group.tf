# NAT 인스턴스용 보안 그룹
resource "aws_security_group" "nat_instance_1_sg" {
  name        = "nat_instance_1_sg"
  description = "NAT-Instance SG"
  vpc_id      = aws_vpc.legacy_vpc_1.id

  # 프라이빗 서브넷에서 인터넷 게이트웨이로 나가는 트래픽 허용
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = -1
    cidr_blocks = [
      aws_subnet.legacy_private_subnet_1.cidr_block
    ]
  }
  egress {
    from_port = 0
    to_port   = 0
    protocol  = -1
    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }
}

# 웹/앱 인스턴스 보안 그룹
resource "aws_security_group" "web_instance_sg" {
  name        = "web_instance_sg"
  description = "WEB-Instance SG"
  vpc_id      = aws_vpc.legacy_vpc_1.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.web_app_ssh_ingress_cidrs
  }
  ingress {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }
  # 현재 지금 웹은 https를 사용하지 않음
  # ingress {
  #   from_port = 443
  #   to_port   = 443
  #   protocol  = "tcp"
  #   cidr_blocks = [
  #     "0.0.0.0/0"
  #   ]
  # }
  egress {
    from_port = 0
    to_port   = 0
    protocol  = -1
    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }
}

# db 인스턴스 보안 그룹
resource "aws_security_group" "db_instance_sg" {
  name        = "db_instance_sg"
  description = "DB Instance SG"
  vpc_id      = aws_vpc.legacy_vpc_1.id

  ingress {
    from_port = 3306
    to_port   = 3306
    protocol  = "tcp"
    security_groups = [
      aws_security_group.web_instance_sg.id
    ]
  }
  ingress {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    security_groups = [
      aws_security_group.web_instance_sg.id
    ]
  }
  egress {
    from_port = 0
    to_port   = 0
    protocol  = -1
    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }
}

# 부하 발생기 (load test) SG
resource "aws_security_group" "load_test_instance_sg" {
  count = var.is_load_test ? 1 : 0

  name        = "load_test_instance_sg"
  description = "load test Instance SG"
  vpc_id      = aws_vpc.legacy_vpc_1.id

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.web_app_ssh_ingress_cidrs
  }
  egress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    cidr_blocks = [
      "0.0.0.0/0"
    ]
  }
}