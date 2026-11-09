terraform {
  required_version = ">= 1.5"
}

provider "aws" {
  region = var.region
}

resource "aws_s3_bucket" "invoices" {
  bucket = "acme-example-invoices"
}
