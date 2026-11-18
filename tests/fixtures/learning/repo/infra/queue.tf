resource "aws_sqs_queue" "orders" {
  name       = "orders.fifo"
  fifo_queue = true
}
