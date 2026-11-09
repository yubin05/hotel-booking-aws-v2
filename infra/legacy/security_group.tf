# REVIEW(참고): 과제 2에서 앱 SG와 DB SG가 서로를 참조하면, 규칙을 SG 블록 안에 쓰는 방식은 순환 참조가 날 수 있음
#   → aws_vpc_security_group_ingress_rule 문서 보기
### 보안 그룹 모음
# NAT 인스턴스용 보안 그룹
resource "aws_security_group" "nat_instance_1_sg" {
  name = "nat_instance_1_sg"
  # REVIEW(필수): SG description은 영문·숫자·일부 기호만 가능 → 한글이면 apply 때 AWS가 거부(validate는 통과). 주석은 한글 OK
  description = "NAT-Instance SG"
  vpc_id = aws_vpc.legacy_vpc_1.id  # REVIEW(필수): 속성이 빠짐 (network.tf 맨 위 설명)

  # 프라이빗 서브넷에서 인터넷 게이트웨이로 나가는 트래픽 허용
  ingress {
    from_port = 0
    to_port = 0
    protocol = -1
    cidr_blocks = [
        aws_subnet.legacy_private_subnet_1  # REVIEW(필수): ID가 아니라 CIDR 문자열이 필요 → 서브넷의 어떤 속성?
    ]
  }
  egress {
    from_port = 0
    to_port = 0
    protocol = -1
    cidr_blocks = [
        "0.0.0.0/0"
    ]
  }
}