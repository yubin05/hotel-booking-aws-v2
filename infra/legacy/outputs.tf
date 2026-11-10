output "web_instance_1_public_ip" {
  value = aws_instance.web_instance_1.public_ip
}

output "db_instance_1_private_ip" {
  value = aws_instance.db_instance_1.private_ip
}