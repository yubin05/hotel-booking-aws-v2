output "web_instance_1_public_ip" {
  value = aws_instance.web_instance_1.public_ip
}

output "db_instance_1_private_ip" {
  value = aws_instance.db_instance_1.private_ip
}

output "load_test_instance_1_public_ip" {
  description = "부하 발생기 공인 IP, 생성하지 않으면 null 발생"
  value       = one(aws_instance.load_test_instance_1[*].public_ip)
}