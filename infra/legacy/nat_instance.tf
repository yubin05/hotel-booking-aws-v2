# REVIEW(권장): 최신 AMI를 매번 읽으면 새 AMI가 나올 때 plan이 NAT 인스턴스 교체를 제안함 → lifecycle과 AMI 고정 중 선택 (과제 질문 5)
#   그리고 평소 그룹에 SSM 파라미터 읽기 권한이 있어야 함
data "aws_ssm_parameter" "al2023_ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# NAT 인스턴스
resource "aws_instance" "nat_instance_1" {
  ami = data.aws_ssm_parameter.al2023_ami.value
  instance_type = var.nat_1_instance_type
  subnet_id = aws_subnet.legacy_public_subnet_1  # REVIEW(필수): 속성이 빠짐 (network.tf 맨 위 설명)

  vpc_security_group_ids = [
    aws_security_group.nat_instance_1_sg  # REVIEW(필수): 속성이 빠짐 (network.tf 맨 위 설명)
  ]

  # REVIEW(권장): 방향 맞음. EC2는 출발지나 목적지가 자기 자신이 아닌 패킷을 버림 → NAT는 남의 패킷을 넘겨주므로 꺼야 함. 아래 주석을 확신 있게 고쳐 쓰기
  # NAT 인스턴스 같은 경우는 트래픽 중간 다리 역할이므로 소스 IP와 목적지 IP가 달라질 수 있음?
  source_dest_check = false

  # REVIEW(필수): AL2023엔 iptables 명령이 기본으로 없음(주석엔 맞게 써 놓고 설치하는 줄이 없음)
  #   → v1 user_data(원본 340줄 부근)에서 iptables 앞에 무엇을 먼저 하는지 비교. 빠지면 apply는 성공하고 NAT만 조용히 안 됨
  # REVIEW(권장): ens5 고정은 t3에선 맞지만 인스턴스 종류를 바꾸면 깨짐(t2는 eth0) → v1은 왜 IFACE를 계산했을까 (과제 질문 4)
  user_data = <<-EOF
    #!/bin/bash
    # 커널 IP 포워딩 활성화
    sysctl -w net.ipv4.ip_forward=1
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf

    # iptables 마스커레이드(NAT) 설정
    # AL2023은 기본적으로 nftables/iptables-nft를 사용하므로 아래 명령어로 호환해야 함
    iptables -t nat -A POSTROUTING -o ens5 -j MASQUERADE
  EOF

  tags = {
    "Name" = "legacy-nat_instance_1"
  }
}
