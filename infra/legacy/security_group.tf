### 보안 그룹 모음
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