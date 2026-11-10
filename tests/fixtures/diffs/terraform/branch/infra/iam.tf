resource "aws_iam_policy" "invoice_writer" {
  name = "invoice-writer"
  description = "Lets the API write invoices to the bucket."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "*"
      Resource = "*"
    }]
  })
}
