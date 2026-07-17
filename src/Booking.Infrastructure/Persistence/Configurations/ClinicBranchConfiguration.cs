using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class ClinicBranchConfiguration : IEntityTypeConfiguration<ClinicBranch>
{
    public void Configure(EntityTypeBuilder<ClinicBranch> builder)
    {
        builder.Property(b => b.Name).HasMaxLength(200).IsRequired();
        builder.Property(b => b.Address).HasMaxLength(300).IsRequired();
        builder.Property(b => b.City).HasMaxLength(100).IsRequired();
        builder.Property(b => b.Municipality).HasMaxLength(100);
        builder.Property(b => b.PhoneNumber).HasMaxLength(30);
        builder.Property(b => b.Latitude).HasPrecision(9, 6);
        builder.Property(b => b.Longitude).HasPrecision(9, 6);

        builder.HasIndex(b => b.ClinicId);
        builder.HasIndex(b => b.City);
    }
}
