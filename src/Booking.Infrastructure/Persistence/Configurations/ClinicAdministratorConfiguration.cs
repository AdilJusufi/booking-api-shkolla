using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class ClinicAdministratorConfiguration : IEntityTypeConfiguration<ClinicAdministrator>
{
    public void Configure(EntityTypeBuilder<ClinicAdministrator> builder)
    {
        builder.HasIndex(a => new { a.UserId, a.ClinicId }).IsUnique();
        builder.HasIndex(a => a.UserId);

        builder.HasOne(a => a.Clinic)
            .WithMany()
            .HasForeignKey(a => a.ClinicId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
